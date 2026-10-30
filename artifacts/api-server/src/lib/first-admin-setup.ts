import { createHash, timingSafeEqual } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { hashPassword } from "./auth.ts";

const setupInputSchema = z
  .object({
    setupKey: z.string().regex(/^[0-9a-fA-F]{64}$/),
    organizationName: z.string().trim().min(2).max(120),
    organizationSlug: z
      .string()
      .trim()
      .toLowerCase()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
    password: z.string().min(12).max(256),
  })
  .superRefine((value, context) => {
    if (value.password === value.setupKey) {
      context.addIssue({
        code: "custom",
        path: ["password"],
        message: "The administrator password must differ from the setup key.",
      });
    }
  });

type SetupDatabase = Pick<Pool, "query" | "connect">;

export type FirstAdminSetupResult =
  | {
      ok: true;
      organizationName: string;
      organizationSlug: string;
      email: string;
    }
  | {
      ok: false;
      status: 400 | 403 | 409 | 503;
      code: string;
      message: string;
    };

export function isFirstAdminSetupKeyConfigured(key: string | undefined): key is string {
  return typeof key === "string" && /^[0-9a-fA-F]{64}$/.test(key);
}

export function matchesFirstAdminSetupKey(provided: string, configured: string): boolean {
  const providedDigest = createHash("sha256").update(provided, "utf8").digest();
  const configuredDigest = createHash("sha256").update(configured, "utf8").digest();
  return timingSafeEqual(providedDigest, configuredDigest);
}

export async function getFirstAdminSetupStatus(
  database: SetupDatabase,
  configuredKey: string | undefined,
): Promise<{ enabled: boolean }> {
  if (!isFirstAdminSetupKeyConfigured(configuredKey)) return { enabled: false };

  const client = await database.connect();
  let transactionStarted = false;
  try {
    await client.query("BEGIN");
    transactionStarted = true;
    const organizations = await client.query<{ id: string }>(
      "SELECT id FROM identity.organizations",
    );
    for (const organization of organizations.rows) {
      await client.query("SELECT set_config('app.org_id', $1, true)", [organization.id]);
      const existingUser = await client.query("SELECT 1 FROM identity.users LIMIT 1");
      if (existingUser.rowCount) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return { enabled: false };
      }
    }
    await client.query("ROLLBACK");
    transactionStarted = false;
    return { enabled: true };
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function createFirstAdmin(
  database: SetupDatabase,
  configuredKey: string | undefined,
  input: unknown,
  passwordHasher: (password: string) => Promise<string> = hashPassword,
): Promise<FirstAdminSetupResult> {
  if (!isFirstAdminSetupKeyConfigured(configuredKey)) {
    return {
      ok: false,
      status: 503,
      code: "FIRST_ADMIN_SETUP_UNAVAILABLE",
      message: "First administrator setup is not configured.",
    };
  }

  const parsed = setupInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      code: "INVALID_REQUEST",
      message: "Enter valid setup details and a password of at least 12 characters.",
    };
  }
  if (!matchesFirstAdminSetupKey(parsed.data.setupKey, configuredKey)) {
    return {
      ok: false,
      status: 403,
      code: "INVALID_SETUP_KEY",
      message: "The setup key is incorrect.",
    };
  }

  const passwordHash = await passwordHasher(parsed.data.password);
  const client = await database.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;
    await client.query("SELECT pg_advisory_xact_lock($1, $2)", [1463897169, 1]);

    const existingOrganization = await client.query(
      "SELECT id, name, slug FROM identity.organizations",
    );
    for (const organization of existingOrganization.rows as Array<{ id: string }>) {
      await client.query("SELECT set_config('app.org_id', $1, true)", [organization.id]);
      const existingUser = await client.query("SELECT 1 FROM identity.users LIMIT 1");
      if (existingUser.rowCount) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return {
          ok: false,
          status: 409,
          code: "FIRST_ADMIN_SETUP_CLOSED",
          message: "First administrator setup has already been completed.",
        };
      }
    }

    const existingTarget = (existingOrganization.rows as Array<{ id: string; name: string; slug: string }>)
      .find((organization) => organization.slug === parsed.data.organizationSlug);
    let organizationId = existingTarget?.id;
    let organizationName = existingTarget?.name ?? parsed.data.organizationName;

    if (!organizationId && existingOrganization.rowCount) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return {
        ok: false,
        status: 409,
        code: "FIRST_ADMIN_ORGANIZATION_NOT_FOUND",
        message: "Use the existing organization ID for this database.",
      };
    }

    if (!organizationId) {
      const organization = await client.query<{ id: string }>(
        `INSERT INTO identity.organizations (name, slug)
         VALUES ($1, $2)
         RETURNING id`,
        [parsed.data.organizationName, parsed.data.organizationSlug],
      );
      organizationId = organization.rows[0]?.id;
      if (!organizationId) throw new Error("First administrator setup could not create the organization.");
    }

    await client.query("SELECT set_config('app.org_id', $1, true)", [organizationId]);
    const user = await client.query<{ id: string }>(
      `INSERT INTO identity.users (org_id, email, name, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [organizationId, parsed.data.email, parsed.data.name, passwordHash],
    );
    const userId = user.rows[0]?.id;
    if (!userId) throw new Error("First administrator setup could not create the account.");

    await client.query(
      `INSERT INTO identity.user_roles (org_id, user_id, role)
       VALUES ($1, $2, 'org_admin')`,
      [organizationId, userId],
    );
    await client.query("COMMIT");
    transactionStarted = false;

    return {
      ok: true,
      organizationName,
      organizationSlug: parsed.data.organizationSlug,
      email: parsed.data.email,
    };
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK").catch(() => undefined);
    if ((error as { code?: string }).code === "23505") {
      return {
        ok: false,
        status: 409,
        code: "FIRST_ADMIN_SETUP_CONFLICT",
        message: "The organization slug or email is already in use.",
      };
    }
    if ((error as { code?: string }).code === "42501") {
      return {
        ok: false,
        status: 503,
        code: "FIRST_ADMIN_DATABASE_PERMISSION",
        message: "Database setup permissions are missing. Apply the first-admin database migration, then retry.",
      };
    }
    throw error;
  } finally {
    client.release();
  }
}
