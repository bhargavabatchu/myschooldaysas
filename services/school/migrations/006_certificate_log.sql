-- Log of certificates issued by the school (TC, bonafide, study, character)
-- so administrators can report on issuance dates and history.

CREATE TABLE school.certificate_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
  student_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('tc', 'bonafide', 'study', 'character')),
  actor_user_id uuid NOT NULL REFERENCES identity.users(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX certificate_log_org_date_idx ON school.certificate_log (org_id, created_at DESC);
CREATE INDEX certificate_log_org_student_idx ON school.certificate_log (org_id, student_user_id);
-- @rls school.certificate_log
ALTER TABLE school.certificate_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE school.certificate_log FORCE ROW LEVEL SECURITY;
CREATE POLICY certificate_log_org_scope ON school.certificate_log
  USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

GRANT SELECT, INSERT ON school.certificate_log TO campus_app;
ALTER DEFAULT PRIVILEGES FOR ROLE campus_migrator IN SCHEMA school
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO campus_app;

INSERT INTO public.schema_migrations (version) VALUES ('school:006');
