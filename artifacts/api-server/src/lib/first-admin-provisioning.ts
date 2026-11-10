import type { Pool } from "pg";
import { z } from "zod";
import { adminCreateUser, SupabaseUserExistsError } from "./supabase-admin.ts";

/** Creates the Supabase Auth account and returns its user id. */
export type SupabaseUserFactory = (email: string, password: string) => Promise<string>;

const defaultSupabaseUserFactory: SupabaseUserFactory = async (email, password) => {
  const user = await adminCreateUser({ email, password, emailConfirm: true });
  return user.id;
};

const firstAdminInputSchema = z.object({
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
});

type ProvisioningDatabase = Pick<Pool, "connect">;

export type FirstAdminProvisioningResult =
  | {
      ok: true;
      organizationName: string;
      organizationSlug: string;
      email: string;
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

export async function provisionFirstAdmin(
  database: ProvisioningDatabase,
  input: unknown,
  supabaseUserFactory: SupabaseUserFactory = defaultSupabaseUserFactory,
): Promise<FirstAdminProvisioningResult> {
  const parsed = firstAdminInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "INVALID_REQUEST",
      message: "Enter a valid school, administrator, email, and password of at least 12 characters.",
    };
  }

  let supabaseUserId: string;
  try {
    supabaseUserId = await supabaseUserFactory(parsed.data.email, parsed.data.password);
  } catch (error) {
    if (error instanceof SupabaseUserExistsError) {
      return {
        ok: false,
        code: "FIRST_ADMIN_CONFLICT",
        message: "A Supabase account with this email already exists.",
      };
    }
    return {
      ok: false,
      code: "SUPABASE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Could not create the Supabase administrator account.",
    };
  }
  const client = await database.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;
    await client.query("SELECT pg_advisory_xact_lock($1, $2)", [1463897169, 1]);

    const organizations = await client.query<{ id: string; name: string; slug: string }>(
      "SELECT id, name, slug FROM identity.organizations",
    );
    for (const organization of organizations.rows) {
      await client.query("SELECT set_config('app.org_id', $1, true)", [organization.id]);
      const existingUser = await client.query("SELECT 1 FROM identity.users LIMIT 1");
      if (existingUser.rowCount) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return {
          ok: false,
          code: "FIRST_ADMIN_ALREADY_EXISTS",
          message: "This database already has a user account. Use that administrator account instead.",
        };
      }
    }

    const existingOrganization = organizations.rows.find(
      (organization) => organization.slug === parsed.data.organizationSlug,
    );
    if (!existingOrganization && organizations.rowCount) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return {
        ok: false,
        code: "ORGANIZATION_NOT_FOUND",
        message: "Use the exact organization ID already present in this database.",
      };
    }

    let organizationId = existingOrganization?.id;
    const organizationName = existingOrganization?.name ?? parsed.data.organizationName;
    if (!organizationId) {
      const createdOrganization = await client.query<{ id: string }>(
        `INSERT INTO identity.organizations (name, slug)
         VALUES ($1, $2)
         RETURNING id`,
        [parsed.data.organizationName, parsed.data.organizationSlug],
      );
      organizationId = createdOrganization.rows[0]?.id;
      if (!organizationId) throw new Error("Could not create the initial school organization.");
    }

    await client.query("SELECT set_config('app.org_id', $1, true)", [organizationId]);
    const user = await client.query<{ id: string }>(
      `INSERT INTO identity.users (org_id, email, name, password_hash, supabase_user_id)
       VALUES ($1, $2, $3, NULL, $4)
       RETURNING id`,
      [organizationId, parsed.data.email, parsed.data.name, supabaseUserId],
    );
    const userId = user.rows[0]?.id;
    if (!userId) throw new Error("Could not create the initial administrator account.");

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
        code: "FIRST_ADMIN_CONFLICT",
        message: "The organization ID or administrator email is already in use.",
      };
    }
    if ((error as { code?: string }).code === "42501") {
      return {
        ok: false,
        code: "FIRST_ADMIN_DATABASE_PERMISSION",
        message: "Database permissions are missing. Apply identity migration 003, then retry.",
      };
    }
    throw error;
  } finally {
    client.release();
  }
}
