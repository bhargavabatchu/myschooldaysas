CREATE TABLE academic.academic_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
  academic_year text NOT NULL CHECK (length(btrim(academic_year)) BETWEEN 4 AND 24),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'current', 'completed')),
  created_by uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  UNIQUE (org_id, academic_year)
);

CREATE UNIQUE INDEX academic_years_one_current_per_org
  ON academic.academic_years (org_id)
  WHERE status = 'current';

-- @rls academic.academic_years
ALTER TABLE academic.academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic.academic_years FORCE ROW LEVEL SECURITY;
CREATE POLICY academic_years_org_scope ON academic.academic_years
  USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON academic.academic_years TO campus_app;

WITH known_years AS (
  SELECT org_id, academic_year FROM academic.enrollments
  UNION
  SELECT org_id, academic_year FROM fees.invoices
),
active_years AS (
  SELECT DISTINCT org_id, academic_year
    FROM academic.enrollments
   WHERE status = 'active'
),
ranked_years AS (
  SELECT known.org_id,
         known.academic_year,
         active.academic_year IS NOT NULL AS has_active_enrollment,
         row_number() OVER (
           PARTITION BY known.org_id
           ORDER BY (active.academic_year IS NOT NULL) DESC, known.academic_year DESC
         ) AS year_rank
    FROM known_years known
    LEFT JOIN active_years active
      ON active.org_id = known.org_id AND active.academic_year = known.academic_year
)
INSERT INTO academic.academic_years (org_id, academic_year, status)
SELECT org_id,
       academic_year,
       CASE WHEN has_active_enrollment AND year_rank = 1 THEN 'current' ELSE 'completed' END
  FROM ranked_years;

INSERT INTO public.schema_migrations (version) VALUES ('academic:011');
