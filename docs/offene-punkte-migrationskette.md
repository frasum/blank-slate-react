# Offene Punkte — Migrationskette & DB-Tests (Stand 2026-07-12)

Befunde aus der lokalen Reproduktion der `db-integration`-Suite gegen einen
frisch migrierten Stack (`supabase start` auf leeren Volumes). Die in diesem
Branch enthaltenen Fixes sind in den Commit-Messages dokumentiert. Folgende
Punkte brauchen eine Entscheidung und sind bewusst NICHT gefixt:

## 1. `tax_class`-Constraint vs. Test-Seed (m4-Suite, 36 Tests)

`staff_personal_details.tax_class` erlaubt laut Migration
`20260614122335` nur `'I'`–`'VI'` (roemisch). Der Test
`m4-payroll-permissions.db.test.ts` seedet `"1"` (arabisch) und scheitert
damit auf jeder frisch migrierten DB. Vermutlich wurde der Constraint auf
der Live-DB direkt geaendert (Drift). Klaeren: Welche Schreibweise ist
kanonisch? Dann Constraint-Migration ODER Test anpassen.

## 2. Finalize wirft `PoolHoursWarningError` (cash-finalize, 2 Tests)

`finalizeSessionCore` warnt bei Poolgeld ohne anrechenbare Stunden, sofern
nicht `confirmPoolWarning: true` uebergeben wird. Der Test ruft ohne
Bestaetigung auf. Entweder Test aktualisieren oder pruefen, ob ein
Settings-Default (z. B. `kitchen_tip_rate`) zwischen Live-DB und Kette
abweicht.

## 3. Error-Mapping (2–3 Tests, noch nicht abschliessend analysiert)

`adminCreateWaiterSettlementCore` (Duplikat) wirft die richtige Meldung,
aber nicht die erwartete Fehlerklasse; `create_order_from_cart` liefert
P0006/P0007 nicht wie im Test erwartet. Kandidaten fuer veraltete Tests
oder geaenderte RPC-Fehlercodes.

## 4. `ci.yml`-Kommentar korrigieren

Der Kommentar am Job `db-integration` (PGRST204/205 = "Schema-Cache-Bug,
75/79 gruen") beschreibt die Symptome der bei Migration 66 abgeschnittenen
Kette (Ursache: nackte `COMMIT;`/`BEGIN;` in Migrationsdateien, gefixt in
diesem Branch). Nach gruener CI: Kommentar aktualisieren und
`continue-on-error` fuer `db-integration` zuruecknehmen.
