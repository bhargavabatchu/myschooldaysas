CREATE TABLE school.highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 160),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 3000),
  category text NOT NULL CHECK (category IN ('achievement', 'event', 'school_news')),
  audience text NOT NULL CHECK (audience IN ('school', 'class', 'section')),
  audience_ids uuid[] NOT NULL DEFAULT '{}',
  photo_object_name text,
  photo_content_type text,
  photo_alt text,
  photo_consent_confirmed boolean NOT NULL DEFAULT false,
  published_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  CHECK (expires_at IS NULL OR expires_at > published_at),
  CHECK (
    (audience = 'school' AND cardinality(audience_ids) = 0)
    OR (audience IN ('class', 'section') AND cardinality(audience_ids) = 1)
  ),
  CHECK (
    (photo_object_name IS NULL AND photo_content_type IS NULL AND photo_alt IS NULL)
    OR (
      photo_object_name IS NOT NULL
      AND photo_content_type IS NOT NULL
      AND photo_content_type IN ('image/jpeg', 'image/png', 'image/webp')
      AND photo_alt IS NOT NULL
      AND char_length(photo_alt) BETWEEN 3 AND 180
      AND photo_consent_confirmed
    )
  )
);

CREATE INDEX highlights_org_published_idx
  ON school.highlights (org_id, published_at DESC, id);
CREATE INDEX highlights_org_audience_idx
  ON school.highlights (org_id, audience, published_at DESC);

-- @rls school.highlights
ALTER TABLE school.highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE school.highlights FORCE ROW LEVEL SECURITY;
CREATE POLICY highlights_org_scope ON school.highlights
  USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON school.highlights TO campus_app;

INSERT INTO public.schema_migrations (version) VALUES ('school:004');
