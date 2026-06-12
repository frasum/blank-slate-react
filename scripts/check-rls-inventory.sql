-- RLS-Inventur (B0)
-- Manuell ausführbar gegen die Supabase-DB; CI-Integration folgt in einem späteren Schritt.
--
-- Hintergrund (Gründungsdokument, Abschnitt Qualitätsstandards):
--   * Öffentlich lesbare Policies (Rollen anon/public) dürfen nur an EXPLIZIT
--     freigegebenen Tabellen existieren — alles andere ist ein Fund.
--   * Bedingungslose Schreib-Policies (USING true / WITH CHECK true) sind
--     verboten, außer sie sind im Code dokumentiert begründet.

-- Query 1: Policies, die für anon oder public greifen.
-- Erwartetes Ergebnis nach B0: 0 Zeilen.
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    'anon'   = ANY (roles)
    OR 'public' = ANY (roles)
  )
ORDER BY tablename, policyname;

-- Query 2: Schreib-Policies (INSERT/UPDATE/DELETE/ALL) ohne Einschränkung.
-- Erwartetes Ergebnis nach B0: 0 Zeilen.
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  AND (
    qual       IS NULL OR qual       IN ('true', '(true)')
  )
  AND (
    with_check IS NULL OR with_check IN ('true', '(true)')
  )
ORDER BY tablename, policyname;