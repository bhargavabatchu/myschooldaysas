-- Staff job categories: teachers, HODs, clerks, drivers, attenders, etc.
ALTER TABLE identity.staff_profiles
  ADD COLUMN IF NOT EXISTS category text;

INSERT INTO public.schema_migrations (version) VALUES ('identity:010');
