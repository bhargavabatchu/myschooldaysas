# Managed database setup

## Chosen scope

Use Replit-managed PostgreSQL for the published application. Preserve the existing local database. Copy the application schema, not the local demo accounts.

The managed **development** database was initially empty. The existing 22 service migrations listed in `scripts/db/migrate.sh` were applied there in one transaction, without editing any applied migration. No local data or credentials were copied.

## Verification performed

Against the managed development database:

| Check | Result |
| --- | --- |
| `SELECT COUNT(*) FROM public.schema_migrations` | 22 |
| Tenant tables with an `org_id` column | 40 |
| Tenant tables with enabled and forced RLS | 40 |
| Tenant tables with read/write RLS predicates | 40 |
| `SELECT COUNT(*) FROM identity.organizations` | 0 |
| `SELECT COUNT(*) FROM identity.users` | 0 |
| `campus_app` role | NOSUPERUSER, NOBYPASSRLS, no public-schema CREATE |
| `campus_migrator` role | NOSUPERUSER, NOBYPASSRLS; owns service schemas |

A transaction-only isolation test created two synthetic organizations and users, switched to `campus_app`, and verified:

- Own-organization rows were visible.
- Another organization's rows were hidden.
- A cross-organization update affected zero rows.
- A cross-organization insert raised `insufficient_privilege`.
- The app role could not create objects in `identity`/`public` or truncate `identity.users`.

The test transaction was rolled back. A subsequent query confirmed that organizations and users were both still empty.

## Production runtime connection

The API requires the production-only `CAMPUS_DATABASE_URL` connection string. It deliberately does not fall back to Replit's platform-managed `DATABASE_URL` in production, because the available platform login roles can bypass RLS. Development continues to use `DATABASE_URL`.

Production needs a restricted login role (`NOSUPERUSER`, `NOBYPASSRLS`) that inherits the non-login `campus_app` permission role. The login must not own tenant tables or schemas. Keep forced RLS enabled, and grant only the required schema/table/sequence permissions to the group role. Store the restricted login's full URL as the `CAMPUS_DATABASE_URL` production secret; never paste it into chat or commit it.

The production schema now exists and has 40 tenant tables with RLS enabled and forced. The production roles inspected so far include `cloud_admin` (superuser) and `neon_service` / `neondb_owner` (BYPASSRLS); the restricted custom roles were not provisioned by the schema-copy step. Do not disable the API's startup guard or use a `SET ROLE` workaround on a privileged connection.

## Remaining publication requirements

1. Provision the production restricted login and group role through supported database administration. Schema publishing copies schemas, not role credentials or memberships.
2. Add the restricted connection as the production `CAMPUS_DATABASE_URL` secret. Never use the platform `DATABASE_URL` as the API runtime connection.
3. After a successful API start, verify the **actual production connection role**. The administrative SQL tool's identity is not proof of the application's runtime identity.
4. Provision the school's first organization and administrator securely, then verify real signed-in core journeys. The production schema is empty; do not import demo passwords or seed production.

## Future schema work

The local API workflow sources `.env` and migrates the local database. That does not update the managed database automatically. Apply future numbered service migrations to managed **development** explicitly, verifying the target and tracking migration versions; Publishing is responsible for managed production schema changes. Never add production DDL to API startup or build commands.
