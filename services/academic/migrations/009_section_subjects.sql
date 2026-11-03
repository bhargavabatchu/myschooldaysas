CREATE TABLE academic.section_subjects (
  org_id uuid NOT NULL,
  section_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, section_id, subject_id),
  FOREIGN KEY (org_id, section_id) REFERENCES academic.sections(org_id, id) ON DELETE CASCADE,
  FOREIGN KEY (org_id, subject_id) REFERENCES academic.subjects(org_id, id) ON DELETE CASCADE
);

-- @rls academic.section_subjects
ALTER TABLE academic.section_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic.section_subjects FORCE ROW LEVEL SECURITY;
CREATE POLICY section_subjects_org_scope ON academic.section_subjects
  USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
CREATE INDEX section_subjects_org_section_active_idx
  ON academic.section_subjects (org_id, section_id, is_active, subject_id);

INSERT INTO academic.subjects (org_id, name)
SELECT DISTINCT sections.org_id, common.name
  FROM academic.sections sections
 CROSS JOIN (VALUES
   ('English'),
   ('Mathematics'),
   ('Science'),
   ('Social Studies'),
   ('Hindi'),
   ('Computer Science'),
   ('Physical Education'),
   ('Arts')
 ) AS common(name)
ON CONFLICT (org_id, name) DO NOTHING;

INSERT INTO academic.section_subjects (org_id, section_id, subject_id)
SELECT sections.org_id, sections.id, subjects.id
  FROM academic.sections sections
  JOIN academic.subjects subjects
    ON subjects.org_id = sections.org_id
   AND subjects.name IN (
     'English', 'Mathematics', 'Science', 'Social Studies',
     'Hindi', 'Computer Science', 'Physical Education', 'Arts'
   )
   AND subjects.is_active = true
ON CONFLICT (org_id, section_id, subject_id) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON academic.section_subjects TO campus_app;
ALTER DEFAULT PRIVILEGES FOR ROLE campus_migrator IN SCHEMA academic
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO campus_app;
INSERT INTO public.schema_migrations (version) VALUES ('academic:009');
