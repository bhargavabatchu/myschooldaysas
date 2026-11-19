-- Staff records and enriched student records for school administration.

-- Staff (teachers, HODs, administrators) employment records.
CREATE TABLE identity.staff_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  employee_code text,
  phone text,
  qualification text,
  specialization text,
  joining_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id),
  FOREIGN KEY (org_id, user_id) REFERENCES identity.users(org_id, id) ON DELETE CASCADE
);
-- @rls identity.staff_profiles
ALTER TABLE identity.staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.staff_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY staff_profiles_org_scope ON identity.staff_profiles
  USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON identity.staff_profiles TO campus_app;
ALTER DEFAULT PRIVILEGES FOR ROLE campus_migrator IN SCHEMA identity
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO campus_app;

-- School-register fields that round out a student's record.
ALTER TABLE identity.profiles
  ADD COLUMN IF NOT EXISTS nationality text,
  ADD COLUMN IF NOT EXISTS mother_tongue text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS religion text,
  ADD COLUMN IF NOT EXISTS previous_school text,
  ADD COLUMN IF NOT EXISTS previous_tc_no text;

INSERT INTO public.schema_migrations (version) VALUES ('identity:008');
