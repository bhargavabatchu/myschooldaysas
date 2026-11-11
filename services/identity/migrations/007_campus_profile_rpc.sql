-- Direct-to-Supabase login support: expose the campus profile (org, roles,
-- must-change-password state) to authenticated browser sessions through the
-- Supabase REST API (PostgREST RPC), so sign-in works without the Fastify
-- API being reachable. The caller is identified from the JWT subject claim
-- via current_setting('request.jwt.claim.sub') — deliberately NOT
-- auth.uid(), which requires USAGE on the auth schema that migration roles
-- do not have. identity tables stay RLS-protected; these fixed search-path
-- SECURITY DEFINER functions only ever read/write the caller's own row,
-- located by supabase_user_id.

CREATE OR REPLACE FUNCTION public.my_campus_profile()
RETURNS TABLE (
  id uuid,
  org_id uuid,
  org_slug text,
  name text,
  email text,
  roles text[],
  must_change_password boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = identity, pg_temp
AS $$
DECLARE
  caller uuid := coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
    nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid
  );
  organization record;
  account record;
  role_list text[];
BEGIN
  IF caller IS NULL THEN
    RETURN;
  END IF;

  -- FORCE RLS applies to this function's owner too, so scan per organization
  -- with the tenant setting in place (same pattern as
  -- identity.lookup_user_by_supabase_id). All SQL identifiers are qualified
  -- or aliased because the RETURNS TABLE names are PL/pgSQL variables.
  FOR organization IN SELECT o.id AS org_pk, o.slug FROM identity.organizations o ORDER BY o.id LOOP
    PERFORM set_config('app.org_id', organization.org_pk::text, true);
    SELECT u.id AS usr_id, u.org_id AS usr_org, u.name AS usr_name,
           u.email AS usr_email, u.must_change_password AS usr_mcp
      INTO account
      FROM identity.users u
     WHERE u.supabase_user_id = caller
       AND u.status = 'active'
     LIMIT 1;

    IF account IS NOT NULL THEN
      SELECT COALESCE(array_agg(ur.role ORDER BY ur.role), '{}')
        INTO role_list
        FROM identity.user_roles ur
       WHERE ur.user_id = account.usr_id AND ur.org_id = account.usr_org;

      IF role_list = '{}' THEN
        RETURN; -- accounts without roles cannot sign in
      END IF;

      RETURN QUERY SELECT account.usr_id, account.usr_org, organization.slug,
                          account.usr_name, account.usr_email, role_list,
                          account.usr_mcp;
      RETURN;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_campus_password_change()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = identity, pg_temp
AS $$
DECLARE
  caller uuid := coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
    nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid
  );
  organization record;
  updated_count integer := 0;
BEGIN
  IF caller IS NULL THEN
    RETURN false;
  END IF;

  FOR organization IN SELECT o.id AS org_pk FROM identity.organizations o ORDER BY o.id LOOP
    PERFORM set_config('app.org_id', organization.org_pk::text, true);
    UPDATE identity.users
       SET must_change_password = false,
           temporary_password_expires_at = NULL,
           updated_at = now()
     WHERE supabase_user_id = caller
       AND status = 'active';
    updated_count := updated_count + SQL%ROWCOUNT;
  END LOOP;

  RETURN updated_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.my_campus_profile() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_campus_password_change() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_campus_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_campus_password_change() TO authenticated;

INSERT INTO public.schema_migrations (version) VALUES ('identity:007');
