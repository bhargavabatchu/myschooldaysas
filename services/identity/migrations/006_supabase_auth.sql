-- Supabase Auth migration: link identity.users to auth.users.
-- password_hash is no longer required (legacy scrypt hashes are kept only
-- until each user's first login under Supabase Auth, then cleared).
ALTER TABLE identity.users ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE identity.users ADD COLUMN supabase_user_id uuid;
CREATE UNIQUE INDEX users_supabase_user_id_idx ON identity.users (supabase_user_id)
  WHERE supabase_user_id IS NOT NULL;

-- Token verification happens before the organization scope is known, so the
-- app role cannot read identity.users through the org-scoped RLS policy.
-- FORCE ROW LEVEL SECURITY applies even to this function's owner, so the
-- function sets app.org_id for each organization while scanning. It exposes
-- only the (org_id, user_id) pair for a verified Supabase subject.
CREATE OR REPLACE FUNCTION identity.lookup_user_by_supabase_id(supabase_id uuid)
RETURNS TABLE (org_id uuid, user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = identity, pg_temp
AS $$
DECLARE
  organization record;
BEGIN
  FOR organization IN SELECT id FROM identity.organizations ORDER BY id LOOP
    PERFORM set_config('app.org_id', organization.id::text, true);
    RETURN QUERY
      SELECT u.org_id, u.id
      FROM identity.users u
      WHERE u.supabase_user_id = lookup_user_by_supabase_id.supabase_id
        AND u.status = 'active'
      LIMIT 1;
    IF FOUND THEN
      RETURN;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION identity.lookup_user_by_supabase_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.lookup_user_by_supabase_id(uuid) TO campus_app;

INSERT INTO public.schema_migrations (version) VALUES ('identity:006');
