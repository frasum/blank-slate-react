-- Fix Pool-Zeit-Rückschreibung (§51): PostgREST-Upsert kann partielle
-- Unique-Indizes nicht als onConflict-Ziel nutzen (42P10) — die beiden
-- partiellen Indizes auf (organization_id, import_key) werden durch EINEN
-- vollen ersetzt. Gefahrlos: import_key ist bei clock/manual NULL (NULLs
-- kollidieren nie), und die Key-Präfixe ('pool:<id>' vs. Import-Keys) sind
-- disjunkt. Am 04.07. bereits identisch auf der Live-DB ausgeführt.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT indexname FROM pg_indexes
           WHERE tablename = 'time_entries'
             AND indexdef LIKE '%(organization_id, import_key)%'
             AND indexdef LIKE '%WHERE%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', r.indexname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS time_entries_org_import_key_unique
  ON public.time_entries (organization_id, import_key);