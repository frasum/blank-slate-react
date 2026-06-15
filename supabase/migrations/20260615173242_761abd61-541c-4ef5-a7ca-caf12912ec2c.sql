-- Harden the PostgREST schema-cache reload watcher against mutable search_path linting.
CREATE OR REPLACE FUNCTION public.pgrst_watch()
  RETURNS event_trigger
  LANGUAGE plpgsql
  SET search_path TO pg_catalog
AS $$
BEGIN
  NOTIFY pgrst, 'reload schema';
END;
$$;