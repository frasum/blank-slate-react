# NULL-Location-Zähler im Zeit-Importer + Dry-Run-Anzeige + §10-Doku

Additiver Defense-in-Depth-Fix: importierte Zeilen ohne aufgelöste `location_id` werden gezählt und im Migrations-UI vor dem Commit sichtbar. Keine Schema-Änderung, keine Verhaltensänderung der bestehenden Logik.

## Dateien

**`src/lib/migration/run-import-core.ts`**
- `Counters`-Typ um `importedWithoutLocation: number` (Top-Level, nicht in `skippedByReason`) erweitern. JSDoc-Hinweis: Teilmenge von `imported`, nicht Teil der Bilanz.
- `emptyCounters()` initialisiert `importedWithoutLocation: 0`.
- In `executeImport`-Insert-Schleife: `resolveLocationId(...)` in lokale `locationId` ziehen; bei `null` Zähler erhöhen; Variable im `inserts.push({...})` verwenden.
- `assertCounterBalance` bleibt unverändert.

**`src/routes/_authenticated/admin/migration.tsx` (`CountersView`)**
- Prop-Typ um optionales `importedWithoutLocation?: number` ergänzen.
- Im `flex flex-wrap`-Zähler-Block: bei `> 0` einen Warn-Badge im Stil des bestehenden „Bilanz verletzt!"-Badges (`X ohne Standort`).
- Unterhalb des Zähler-Blocks innerhalb der Karte: kurzer Hinweistext `text-muted-foreground text-xs`, nur bei `> 0` — „Zeilen ohne location_id sind im Wochenplan unsichtbar. Vor dem Commit prüfen, ob der Export die Spalte `restaurant` pro Schicht liefert."
- `Badge` ist bereits importiert, kein neuer Import.

**`src/lib/migration/migration.db.test.ts`**
- CSV-Header-Konstante (`TA_HEADER`) um `,restaurant` ergänzen.
- `taCsv` nimmt `restaurant?: string` pro Zeile (Default `""`) und hängt das Feld an jede Zeile an.
- **Neuer, eigener `it`-Block** (Idempotenz-Test NICHT in place erweitern — dessen `imported===2`/`duplicate===2`-Assertions würden brechen):
  - Beide Zeilen mit `empId: "EMP-1"` (bereits gemappt), frische ids `A-1`/`B-1`, beliebiges Datum.
  - Zeile A: `restaurant: "Hauptstandort"` (Default-Standort aus `seedOrg`).
  - Zeile B: `restaurant: ""`.
  - `executeImport({ … mode: "commit" })`, dann per `import_key` (`tagesabrechnung:A-1` / `tagesabrechnung:B-1`) abfragen.
  - Assertions: A → `location_id === org.defaultLocationId`; B → `location_id IS NULL`; `result.counters.importedWithoutLocation === 1`.
- Kein zusätzliches Cleanup (Default-Standort + Teardown via `seedOrg`/`afterAll`).

**`docs/arbeitsweise.md` §10**
- Schritt 1 der Prozedur: 15 → **16** Spalten; `restaurant` per Schicht über `zt_shifts.week_id → weeks.period_id → scheduling_periods.restaurant_id → restaurants.name` (nicht Heimatstandort des MA).
- Neuer Schritt 2a „Standort-Gate im Dry-Run": `importedWithoutLocation` muss 0 sein, sonst Export korrigieren, nicht committen.
- Offen-Punkt „Importer dauerhaft fixen" → erledigt-Eintrag (resolveLocationId, neuer Zähler, Badge; manueller Backfill nur noch Fallback).
- Stand-Vermerk auf 26.06.2026.

## Nicht angefasst

`resolveLocationId`-Logik, `assertCounterBalance`, Skip-Buckets, Idempotenz, gescopter DELETE, RLS, `import_runs`-Insert, `parse-bunker.ts`, `csv.ts`, `parse-tagesabrechnung.ts`-Header, `parseImportCsv` (Parser-Vorschau hat keine DB-Map → `importedWithoutLocation` bleibt dort bewusst 0). Kein Schema-/Migrations-SQL.

## Gate

`tsc --noEmit`, `format:check` + `prettier@3.7.3 --check docs/arbeitsweise.md`, `eslint . --max-warnings=5`, `vitest run` (bestehende Tests inkl. Idempotenz-Test bleiben grün; `run-import-core.test.ts` unverändert). UI zeigt Badge + Hinweis nur bei `> 0`.
