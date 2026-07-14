-- FK-Index-Inventur: listet FK-Spalten ohne Index (führende Spalte).
-- Erwartetes Ergebnis: NUR organization_id-Zeilen (bewusste Ausnahme,
-- ein Mandant — siehe FK1 in docs/arbeitsweise.md). Jede andere Zeile
-- ist ein Regressions-Befund.
SELECT
  c.conrelid::regclass AS tabelle,
  a.attname            AS fk_spalte,
  c.confrelid::regclass AS zieltabelle
FROM pg_constraint c
JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
WHERE c.contype = 'f'
  AND c.connamespace = 'public'::regnamespace
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = c.conrelid
      AND (i.indkey::int2[])[0] = k.attnum
  )
ORDER BY tabelle, fk_spalte;