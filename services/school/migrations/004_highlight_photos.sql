-- Private file storage in Postgres (bytea) so the embedded/serverless
-- deployment has no external object-storage dependency. Used for school
-- highlight photos and fee-concession attachments. Files are written/read
-- only through org-scoped API code paths; the table carries the same forced
-- tenant RLS as the other school tables.
CREATE TABLE school.stored_files (
  object_name text PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
  content_type text NOT NULL,
  bytes bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX stored_files_org_idx ON school.stored_files (org_id);

-- @rls school.stored_files
ALTER TABLE school.stored_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE school.stored_files FORCE ROW LEVEL SECURITY;
CREATE POLICY stored_files_org_scope ON school.stored_files
  USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

GRANT SELECT, INSERT, DELETE ON school.stored_files TO campus_app;
ALTER DEFAULT PRIVILEGES FOR ROLE campus_migrator IN SCHEMA school
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO campus_app;

INSERT INTO public.schema_migrations (version) VALUES ('school:004');
