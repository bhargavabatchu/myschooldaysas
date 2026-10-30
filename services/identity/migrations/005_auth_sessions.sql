CREATE TABLE identity.auth_sessions (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  refresh_secret_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at)
);

CREATE INDEX auth_sessions_active_user_idx
  ON identity.auth_sessions (org_id, user_id, expires_at)
  WHERE revoked_at IS NULL;

-- @rls identity.auth_sessions
ALTER TABLE identity.auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.auth_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY auth_sessions_org_scope ON identity.auth_sessions
  USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON identity.auth_sessions TO campus_app;
ALTER DEFAULT PRIVILEGES FOR ROLE campus_migrator IN SCHEMA identity
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO campus_app;
