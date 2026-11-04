CREATE TABLE school.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 160),
  kind text NOT NULL CHECK (kind IN ('holiday', 'exam', 'event', 'ptm', 'working_day')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  scope text NOT NULL CHECK (scope IN ('org', 'class', 'section')),
  scope_id uuid,
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  created_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  CHECK (start_date <= end_date),
  CHECK ((scope = 'org' AND scope_id IS NULL) OR (scope IN ('class', 'section') AND scope_id IS NOT NULL))
);
CREATE INDEX calendar_events_org_dates_idx
  ON school.calendar_events (org_id, start_date, end_date);
CREATE INDEX calendar_events_org_scope_idx
  ON school.calendar_events (org_id, scope, scope_id, start_date);
-- @rls school.calendar_events
ALTER TABLE school.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE school.calendar_events FORCE ROW LEVEL SECURITY;
CREATE POLICY calendar_events_org_scope ON school.calendar_events
  USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON school.calendar_events TO campus_app;
INSERT INTO public.schema_migrations (version) VALUES ('school:003');
