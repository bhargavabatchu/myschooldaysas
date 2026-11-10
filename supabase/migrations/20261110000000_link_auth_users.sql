-- Keep identity.users in sync when a Supabase Auth account is deleted: the
-- linked campus account is disabled so it can no longer authenticate.
--
-- This file touches two schemas with different owners; run it in two steps:
--   1. As the identity schema owner (campus_migrator / MIGRATOR_DATABASE_URL):
--      create the function and grant EXECUTE to the dashboard role.
--   2. As the Supabase admin (Dashboard SQL Editor / SUPABASE_ADMIN_DATABASE_URL):
--      create the trigger on auth.users.

-- Step 1 (campus_migrator):
CREATE OR REPLACE FUNCTION identity.handle_auth_user_deleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = identity, pg_temp
AS $$
BEGIN
  UPDATE identity.users
  SET status = 'disabled', updated_at = now()
  WHERE supabase_user_id = OLD.id;
  RETURN OLD;
END;
$$;

GRANT EXECUTE ON FUNCTION identity.handle_auth_user_deleted() TO postgres;

-- Step 2 (Supabase admin / Dashboard SQL Editor):
DROP TRIGGER IF EXISTS auth_user_deleted_link ON auth.users;
CREATE TRIGGER auth_user_deleted_link
  AFTER DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION identity.handle_auth_user_deleted();
