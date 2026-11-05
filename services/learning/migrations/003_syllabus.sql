CREATE UNIQUE INDEX IF NOT EXISTS classes_org_id_id_unique_idx
  ON academic.classes (org_id, id);

CREATE TABLE learning.syllabi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  class_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  created_by uuid NOT NULL REFERENCES identity.users(id),
  updated_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  UNIQUE (org_id, class_id, subject_id),
  FOREIGN KEY (org_id, class_id) REFERENCES academic.classes(org_id, id) ON DELETE CASCADE,
  FOREIGN KEY (org_id, subject_id) REFERENCES academic.subjects(org_id, id) ON DELETE CASCADE
);
-- @rls learning.syllabi
ALTER TABLE learning.syllabi ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning.syllabi FORCE ROW LEVEL SECURITY;
CREATE POLICY syllabi_org_scope ON learning.syllabi
  USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
CREATE INDEX syllabi_org_class_subject_idx ON learning.syllabi (org_id, class_id, subject_id);

CREATE TABLE learning.syllabus_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  syllabus_id uuid NOT NULL,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 180),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 6000),
  position integer NOT NULL CHECK (position >= 0),
  created_by uuid NOT NULL REFERENCES identity.users(id),
  updated_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  UNIQUE (org_id, syllabus_id, position),
  FOREIGN KEY (org_id, syllabus_id) REFERENCES learning.syllabi(org_id, id) ON DELETE CASCADE
);
-- @rls learning.syllabus_lessons
ALTER TABLE learning.syllabus_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning.syllabus_lessons FORCE ROW LEVEL SECURITY;
CREATE POLICY syllabus_lessons_org_scope ON learning.syllabus_lessons
  USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
CREATE INDEX syllabus_lessons_org_syllabus_position_idx
  ON learning.syllabus_lessons (org_id, syllabus_id, position);

CREATE TABLE learning.syllabus_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  lesson_id uuid NOT NULL,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 180),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 6000),
  position integer NOT NULL CHECK (position >= 0),
  created_by uuid NOT NULL REFERENCES identity.users(id),
  updated_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  UNIQUE (org_id, lesson_id, position),
  FOREIGN KEY (org_id, lesson_id) REFERENCES learning.syllabus_lessons(org_id, id) ON DELETE CASCADE
);
-- @rls learning.syllabus_topics
ALTER TABLE learning.syllabus_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning.syllabus_topics FORCE ROW LEVEL SECURITY;
CREATE POLICY syllabus_topics_org_scope ON learning.syllabus_topics
  USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
CREATE INDEX syllabus_topics_org_lesson_position_idx
  ON learning.syllabus_topics (org_id, lesson_id, position);

CREATE TABLE learning.syllabus_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  topic_id uuid NOT NULL,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 180),
  kind text NOT NULL CHECK (kind IN ('document', 'video', 'link')),
  url text NOT NULL CHECK (url ~ '^https://'),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 3000),
  position integer NOT NULL CHECK (position >= 0),
  created_by uuid NOT NULL REFERENCES identity.users(id),
  updated_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  UNIQUE (org_id, topic_id, position),
  FOREIGN KEY (org_id, topic_id) REFERENCES learning.syllabus_topics(org_id, id) ON DELETE CASCADE
);
-- @rls learning.syllabus_materials
ALTER TABLE learning.syllabus_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning.syllabus_materials FORCE ROW LEVEL SECURITY;
CREATE POLICY syllabus_materials_org_scope ON learning.syllabus_materials
  USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
CREATE INDEX syllabus_materials_org_topic_position_idx
  ON learning.syllabus_materials (org_id, topic_id, position);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON learning.syllabi, learning.syllabus_lessons, learning.syllabus_topics, learning.syllabus_materials
  TO campus_app;
ALTER DEFAULT PRIVILEGES FOR ROLE campus_migrator IN SCHEMA learning
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO campus_app;
INSERT INTO public.schema_migrations (version) VALUES ('learning:003') ON CONFLICT DO NOTHING;
