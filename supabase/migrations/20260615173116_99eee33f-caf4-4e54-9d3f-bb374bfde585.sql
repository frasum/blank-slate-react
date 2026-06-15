-- Auto-reload PostgREST schema cache after any DDL change.
-- Recommended by PostgREST docs; fixes stale-cache PGRST204/PGRST205 after
-- migrations (new tables/columns not visible until cache reload).
CREATE OR REPLACE FUNCTION public.pgrst_watch()
  RETURNS event_trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  NOTIFY pgrst, 'reload schema';
END;
$$;

DROP EVENT TRIGGER IF EXISTS pgrst_watch;
CREATE EVENT TRIGGER pgrst_watch
  ON ddl_command_end
  EXECUTE FUNCTION public.pgrst_watch();