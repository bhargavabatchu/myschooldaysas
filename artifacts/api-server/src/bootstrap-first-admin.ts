import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { provisionFirstAdmin } from "./lib/first-admin-provisioning.ts";

function promptHidden(label: string): Promise<string> {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    return Promise.reject(new Error("Run this command in an interactive Replit Shell."));
  }

  stdout.write(label);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");

  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error?: Error) => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: Buffer | string) => {
      for (const character of chunk.toString()) {
        if (character === "\u0003") {
          finish(new Error("Setup cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = [...value].slice(0, -1).join("");
          continue;
        }
        if (character >= " ") value += character;
      }
    };
    stdin.on("data", onData);
  });
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unexpected error.";
  return message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[database connection redacted]");
}

async function main() {
  if (process.env.NODE_ENV !== "production") {
    throw new Error("This command requires NODE_ENV=production.");
  }
  if (!process.env.CAMPUS_DATABASE_URL) {
    throw new Error("CAMPUS_DATABASE_URL is required. The script will not use DATABASE_URL.");
  }

  const { assertLeastPrivilegeDatabaseRole, pool } = await import("@workspace/db");
  try {
    await assertLeastPrivilegeDatabaseRole(pool);

    const context = await pool.query<{
      role_name: string;
      database_name: string;
      can_read_organizations: boolean;
      can_insert_organizations: boolean;
      can_read_users: boolean;
      can_insert_users: boolean;
      can_insert_roles: boolean;
    }>(`
      SELECT current_user AS role_name,
             current_database() AS database_name,
             has_table_privilege(current_user, 'identity.organizations', 'SELECT') AS can_read_organizations,
             has_table_privilege(current_user, 'identity.organizations', 'INSERT') AS can_insert_organizations,
             has_table_privilege(current_user, 'identity.users', 'SELECT') AS can_read_users,
             has_table_privilege(current_user, 'identity.users', 'INSERT') AS can_insert_users,
             has_table_privilege(current_user, 'identity.user_roles', 'INSERT') AS can_insert_roles
    `);
    const databaseContext = context.rows[0];
    if (
      !databaseContext ||
      !databaseContext.can_read_organizations ||
      !databaseContext.can_read_users ||
      !databaseContext.can_insert_users ||
      !databaseContext.can_insert_roles
    ) {
      throw new Error("The restricted database role is missing required identity-table permissions.");
    }

    const organizations = await pool.query<{ name: string; slug: string }>(
      "SELECT name, slug FROM identity.organizations ORDER BY name",
    );
    if (organizations.rowCount === 0 && !databaseContext.can_insert_organizations) {
      throw new Error(
        "The restricted role cannot create the first school. Apply services/identity/migrations/003_first_admin_setup_grant.sql first.",
      );
    }

    console.log(`Connected to database "${databaseContext.database_name}" as "${databaseContext.role_name}".`);
    console.log("No account will be created until you confirm the final prompt.");

    let organizationName = "";
    let organizationSlug = "";
    const rl = createInterface({ input: stdin, output: stdout });
    try {
      if (organizations.rows.length) {
        console.log("\nExisting school organizations:");
        for (const organization of organizations.rows) {
          console.log(`- ${organization.name} (${organization.slug})`);
        }
        organizationSlug = (await rl.question("\nOrganization ID to use: ")).trim().toLowerCase();
        const selected = organizations.rows.find((organization) => organization.slug === organizationSlug);
        if (!selected) throw new Error("That organization ID is not in this database.");
        organizationName = selected.name;
      } else {
        organizationName = await rl.question("School name: ");
        organizationSlug = (await rl.question("Organization ID (lowercase, hyphen-separated): "))
          .trim()
          .toLowerCase();
      }
      const name = await rl.question("Administrator name: ");
      const email = await rl.question("Administrator email: ");
      rl.close();

      console.log("Enter a password of at least 12 characters. Input is hidden.");
      let password = await promptHidden("Administrator password: ");
      let passwordConfirmation = await promptHidden("Confirm password: ");
      if (password !== passwordConfirmation) throw new Error("The passwords do not match.");
      passwordConfirmation = "";
      if (password.length < 12 || password.length > 256) {
        throw new Error("The password must be between 12 and 256 characters.");
      }

      const expectedConfirmation = `CREATE FIRST ADMIN ${databaseContext.database_name} ${organizationSlug}`;
      const confirmation = createInterface({ input: stdin, output: stdout });
      let confirmationText: string;
      try {
        confirmationText = await confirmation.question(
          `Type ${expectedConfirmation} to confirm this database and school: `,
        );
      } finally {
        confirmation.close();
      }
      if (confirmationText.trim() !== expectedConfirmation) {
        password = "";
        console.log("Cancelled. No database changes were made.");
        return;
      }

      const result = await provisionFirstAdmin(pool, {
        organizationName,
        organizationSlug,
        name,
        email,
        password,
      });
      password = "";
      if (!result.ok) throw new Error(result.message);

      console.log(
        `Administrator created for ${result.organizationName} (${result.organizationSlug}) as ${result.email}.`,
      );
      console.log("You can now sign in using that organization ID and email.");
    } finally {
      rl.close();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(`First-admin bootstrap stopped: ${safeErrorMessage(error)}`);
  process.exitCode = 1;
});
