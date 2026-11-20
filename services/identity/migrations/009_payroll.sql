-- Staff payroll: monthly salary structures and payment records.

CREATE TABLE identity.salary_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  monthly_amount_paise bigint NOT NULL CHECK (monthly_amount_paise >= 0),
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id),
  FOREIGN KEY (org_id, user_id) REFERENCES identity.users(org_id, id) ON DELETE CASCADE
);
-- @rls identity.salary_structures
ALTER TABLE identity.salary_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.salary_structures FORCE ROW LEVEL SECURITY;
CREATE POLICY salary_structures_org_scope ON identity.salary_structures
  USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

CREATE TABLE identity.salary_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  period text NOT NULL CHECK (period ~ '^\d{4}-\d{2}$'),
  amount_paise bigint NOT NULL CHECK (amount_paise >= 0),
  paid_on date NOT NULL DEFAULT CURRENT_DATE,
  mode text NOT NULL CHECK (mode IN ('bank', 'cash', 'cheque', 'other')),
  notes text,
  paid_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id, period),
  FOREIGN KEY (org_id, user_id) REFERENCES identity.users(org_id, id) ON DELETE CASCADE
);
CREATE INDEX salary_payments_org_period_idx ON identity.salary_payments (org_id, period);
-- @rls identity.salary_payments
ALTER TABLE identity.salary_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.salary_payments FORCE ROW LEVEL SECURITY;
CREATE POLICY salary_payments_org_scope ON identity.salary_payments
  USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON identity.salary_structures, identity.salary_payments TO campus_app;
ALTER DEFAULT PRIVILEGES FOR ROLE campus_migrator IN SCHEMA identity
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO campus_app;

INSERT INTO public.schema_migrations (version) VALUES ('identity:009');
