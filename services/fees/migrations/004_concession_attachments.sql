ALTER TABLE fees.invoice_concession_audit
  ADD COLUMN attachment_object_name text,
  ADD COLUMN attachment_file_name text,
  ADD COLUMN attachment_content_type text,
  ADD COLUMN attachment_size_bytes integer,
  DROP CONSTRAINT invoice_concession_audit_check;

ALTER TABLE fees.invoice_concession_audit
  ADD CONSTRAINT fees_invoice_concession_audit_attachment_metadata_check
    CHECK (
      (
        attachment_object_name IS NULL
        AND attachment_file_name IS NULL
        AND attachment_content_type IS NULL
        AND attachment_size_bytes IS NULL
      )
      OR (
        attachment_object_name IS NOT NULL
        AND attachment_file_name IS NOT NULL
        AND attachment_content_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')
        AND attachment_size_bytes BETWEEN 1 AND 716800
      )
    ),
  ADD CONSTRAINT fees_invoice_concession_audit_change_or_attachment_check
    CHECK (
      previous_concession_paise <> new_concession_paise
      OR previous_reason IS DISTINCT FROM new_reason
      OR attachment_object_name IS NOT NULL
    );

INSERT INTO public.schema_migrations (version) VALUES ('fees:004');
