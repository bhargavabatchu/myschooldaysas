-- Per-session student microphone permissions set by the host during a live
-- class. Persists host decisions (allow/mute per student or mute-all) so
-- tokens minted for late joiners carry the correct permission.

CREATE TABLE live.session_mic_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES live.sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  can_publish boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, session_id, user_id)
);
CREATE INDEX session_mic_permissions_session_idx
  ON live.session_mic_permissions (org_id, session_id);
-- @rls live.session_mic_permissions
ALTER TABLE live.session_mic_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE live.session_mic_permissions FORCE ROW LEVEL SECURITY;
CREATE POLICY session_mic_permissions_org_scope ON live.session_mic_permissions
  USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON live.session_mic_permissions TO campus_app;
ALTER DEFAULT PRIVILEGES FOR ROLE campus_migrator IN SCHEMA live
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO campus_app;

INSERT INTO public.schema_migrations (version) VALUES ('live:003');
