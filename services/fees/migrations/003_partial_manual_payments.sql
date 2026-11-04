ALTER TABLE fees.payments
  DROP CONSTRAINT payments_org_id_invoice_id_key,
  ADD COLUMN payment_method text,
  ADD COLUMN payment_reference text,
  ADD COLUMN received_on date;

UPDATE fees.payments
   SET payment_method = CASE WHEN gateway = 'manual' THEN 'other' ELSE NULL END,
       received_on = (captured_at AT TIME ZONE 'UTC')::date;

ALTER TABLE fees.payments
  ALTER COLUMN received_on SET DEFAULT CURRENT_DATE,
  ALTER COLUMN received_on SET NOT NULL,
  ADD CONSTRAINT fees_payments_payment_method_check
    CHECK (
      payment_method IS NULL
      OR payment_method IN ('cash', 'upi', 'bank_transfer', 'cheque', 'other')
    ),
  ADD CONSTRAINT fees_payments_manual_method_check
    CHECK (
      (gateway = 'manual' AND payment_method IS NOT NULL)
      OR (gateway <> 'manual' AND payment_method IS NULL)
    ),
  ADD CONSTRAINT fees_payments_reference_check
    CHECK (
      payment_reference IS NULL
      OR length(btrim(payment_reference)) BETWEEN 1 AND 120
    );

CREATE INDEX fees_payments_invoice_captured_idx
  ON fees.payments (org_id, invoice_id, captured_at DESC)
  WHERE status = 'captured';

INSERT INTO public.schema_migrations (version) VALUES ('fees:003');
