-- Schema-Paritaet Live <-> Kette (wie BFIX7): Auf der Live-DB darf
-- 'authenticated' diese Tabellen abfragen (RLS filtert die Zeilen);
-- in der Migrationskette fehlten die GRANTs -> 42501 in db-Tests.
-- Idempotent; live ein No-op.
GRANT SELECT ON public.recipes TO authenticated;
GRANT SELECT ON public.recipe_items TO authenticated;
GRANT SELECT ON public.supplier_locations TO authenticated;
