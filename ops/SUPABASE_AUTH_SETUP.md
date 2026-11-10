# Supabase Auth setup

Authentication runs on Supabase Auth (GoTrue). The Fastify API verifies
Supabase-issued access tokens against the project JWKS (`SUPABASE_JWKS_URL`,
ES256/RS256) on every request, maps the token subject to `identity.users`
via `identity.lookup_user_by_supabase_id`, and reloads roles from
`identity.user_roles` inside the tenant transaction as before. Organization
scoping and RLS are unchanged.

## Environment

| Variable | Used by | Notes |
|---|---|---|
| `SUPABASE_URL` | API | `https://<ref>.supabase.co` |
| `SUPABASE_SECRET_KEY` | API | Service role key; powers Admin API calls (user creation, password reset, sign-out) |
| `SUPABASE_JWKS_URL` | API | Defaults to `$SUPABASE_URL/auth/v1/.well-known/jwks.json` |
| `NEXT_PUBLIC_SUPABASE_URL` | Web | Same project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Web | Publishable (anon) key |

`JWT_SECRET` is no longer used and can be removed.

## Database migrations

1. `services/identity/migrations/006_supabase_auth.sql` adds
   `identity.users.supabase_user_id` (unique partial index), makes
   `password_hash` nullable (legacy scrypt hashes remain only until each
   user's first login), and installs the SECURITY DEFINER lookup function.
   Apply it with the normal migrator flow (`scripts/db/migrate.sh`).
2. `supabase/migrations/20261110000000_link_auth_users.sql` disables the
   linked campus account when a Supabase auth user is deleted. It spans two
   schemas with different owners:
   - as `campus_migrator` (identity schema owner): create
     `identity.handle_auth_user_deleted()` and grant EXECUTE to the dashboard
     role;
   - as the Supabase admin (Dashboard → SQL Editor): create the
     `auth_user_deleted_link` trigger on `auth.users`.

## User migration (migrate-on-login)

Existing users keep working without a password reset: on first login the API
verifies the legacy scrypt hash, creates (or reuses) the Supabase user with
the same password via the Admin API, stores `supabase_user_id`, and clears
`password_hash`. Subsequent logins authenticate directly against Supabase.

Note: Supabase `auth.users` enforces a globally unique email. Campus accounts
are unique per organization; if the same email is used by accounts in two
organizations, the second link fails with a conflict — those users need a
distinct email address.

## First administrator

`npm run bootstrap-first-admin` (in the api-server workspace) now also creates
the Supabase account for the administrator and links it. It requires the
Supabase environment variables above.

## Historical sessions

The remembered-session cookie flow (`identity.auth_sessions`, CSRF cookie,
`POST /identity/auth/refresh`) was removed. Session refresh is handled by the
browser Supabase client; `POST /identity/auth/logout` revokes the caller's
Supabase session through the Admin API. The `identity.auth_sessions` table
remains in existing databases but is no longer read or written.
