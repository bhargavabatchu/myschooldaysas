ALTER TABLE fees.invoices
  ADD COLUMN concession_paise bigint NOT NULL DEFAULT 0
    CHECK (concession_paise >= 0 AND concession_paise <= amount_paise),
  ADD COLUMN concession_reason text,
  DROP CONSTRAINT invoices_status_check,
  ADD CONSTRAINT fees_invoices_status_check
    CHECK (status IN ('unpaid', 'paid', 'waived', 'void')),
  ADD CONSTRAINT fees_invoices_concession_reason_check
    CHECK (
      (concession_paise = 0 AND concession_reason IS NULL)
      OR (concession_paise > 0 AND concession_reason IS NOT NULL AND length(btrim(concession_reason)) >= 3)
    );

CREATE TABLE fees.invoice_concession_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL,
  previous_concession_paise bigint NOT NULL CHECK (previous_concession_paise >= 0),
  new_concession_paise bigint NOT NULL CHECK (new_concession_paise >= 0),
  previous_reason text,
  new_reason text,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 240),
  actor_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, invoice_id) REFERENCES fees.invoices(org_id, id) ON DELETE RESTRICT,
  CHECK (
    previous_concession_paise <> new_concession_paise
    OR previous_reason IS DISTINCT FROM new_reason
  )
);

-- @rls fees.invoice_concession_audit
ALTER TABLE fees.invoice_concession_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE fees.invoice_concession_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY invoice_concession_audit_org_scope ON fees.invoice_concession_audit
  USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
CREATE INDEX invoice_concession_audit_org_invoice_idx
  ON fees.invoice_concession_audit (org_id, invoice_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON fees.invoice_concession_audit TO campus_app;

INSERT INTO public.schema_migrations (version) VALUES ('fees:002');
