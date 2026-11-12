import pg from "pg";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";

const { Pool } = pg;

export function createPool(connectionString: string): pg.Pool {
  if (!connectionString) {
    throw new Error("A database connection string is required.");
  }

  // Serverless hosts (Vercel functions) run several concurrent instances,
  // so the per-instance pool size must stay small against the Supabase
  // pooler; long-running deployments keep the larger default.
  const configuredMax = Number.parseInt(process.env.CAMPUS_DB_POOL_MAX ?? "", 10);
  const max = Number.isFinite(configuredMax) && configuredMax > 0 ? configuredMax : 12;

  // Supabase pooler certificates chain to a root that Node's default CA
  // bundle rejects ("self-signed certificate in certificate chain"). In
  // pg >= 8.12 an sslmode=require/allow/prefer parameter in the URL is
  // treated as verify-full and OVERRIDES the ssl pool option, so the
  // parameter must be stripped from the URL itself. Encryption stays on;
  // identity verification is relaxed unless sslmode=verify-full is set.
  const sslmode = /[?&]sslmode=([^&]+)/.exec(connectionString)?.[1] ?? "";
  const relaxTls =
    sslmode !== "verify-full" &&
    (sslmode !== "" || /\.supabase\.(co|com)/.test(connectionString));
  let effectiveUrl = connectionString;
  let sslOption: pg.PoolConfig["ssl"];
  if (relaxTls) {
    effectiveUrl = connectionString
      .replace(/([?&])sslmode=[^&]*/g, "$1")
      .replace(/\?&+/, "?")
      .replace(/[?&]+$/, "")
      .replace(/&&+/g, "&");
    sslOption = { rejectUnauthorized: false };
  }

  const connection = new Pool({
    connectionString: effectiveUrl,
    max,
    ...(sslOption ? { ssl: sslOption } : {}),
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 10_000,
    query_timeout: 12_000,
    allowExitOnIdle: false,
  });

  connection.on("error", (error) => {
    process.emitWarning(error, {
      code: "PG_POOL_IDLE_CLIENT_ERROR",
      detail: "The PostgreSQL pool received an idle client error.",
    });
  });

  return connection;
}

export function resolveDatabaseUrl(env: NodeJS.ProcessEnv): string {
  const databaseUrl =
    env.NODE_ENV === "production"
      ? env.CAMPUS_DATABASE_URL
      : env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      env.NODE_ENV === "production"
        ? "CAMPUS_DATABASE_URL must be set in production; refusing to use the platform database connection."
        : "DATABASE_URL must be set outside production; refusing to use the production database connection.",
    );
  }

  return databaseUrl;
}

export const pool = createPool(resolveDatabaseUrl(process.env));

export async function assertLeastPrivilegeDatabaseRole(
  connection: pg.Pool = pool,
): Promise<void> {
  const result = await connection.query<{
    role_name: string;
    rolsuper: boolean;
    rolbypassrls: boolean;
  }>(
    `SELECT current_user AS role_name, role.rolsuper, role.rolbypassrls
       FROM pg_roles AS role
      WHERE role.rolname = current_user`,
  );
  const role = result.rows[0];
  if (!role || role.rolsuper || role.rolbypassrls) {
    throw new Error(
      `Database role "${role?.role_name ?? "unknown"}" is privileged; ` +
        "Campus Live requires a non-superuser role with NOBYPASSRLS.",
    );
  }
}

export async function withOrg<T>(
  orgId: string,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.org_id', $1, true)", [orgId]);
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export type { PoolClient, QueryResult, QueryResultRow };
