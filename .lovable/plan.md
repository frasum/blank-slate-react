# Importer setzt `location_id` aus optionaler `restaurant`-Spalte

Reiner TypeScript-Fix im Migration-Modul. Keine Migrationen, kein Schema-Change, kein SQL. Backward-Kompat: 15-Spalten-CSVs ohne `restaurant` importieren weiter (location_id bleibt NULL).

## Dateien

- `src/lib/migration/normalize.ts` — neues Pflichtfeld `locationName: string | null` im `NormalizedShift`-Typ (nach `breakMinutes`).
- `src/lib/migration/csv.ts` — `assertHeaders` bekommt vierten Parameter `optional: readonly string[] = []`; optionale Header gelten nicht als „überzählig".
- `src/lib/migration/parse-tagesabrechnung.ts` — neue Konstante `TAGESABRECHNUNG_OPTIONAL_HEADERS = ["restaurant"]`; `assertHeaders`-Aufruf um vierten Parameter erweitern; `locationName: (r.restaurant ?? "").trim() || null` ins base-Objekt.
- `src/lib/migration/parse-bunker.ts` — `locationName: null` ins base-Objekt (Pflichtfeld erfüllen, kein Mapping; restaurant_id ist ID, kein Name).
- `src/lib/migration/run-import-core.ts`:
  - Exportierte reine Helper-Funktion `resolveLocationId(name, map)` — case-insensitiv + getrimmt, null bei leer/unbekannt.
  - Insertable-Typ um `location_id: string | null` erweitern.
  - Neuer Block direkt nach Idempotenz-Block: locations für `organizationId` laden, `locByName`-Map (lowercased) bauen.
  - `inserts.push({…})` um `location_id: resolveLocationId(s.locationName, locByName)` ergänzen.
- `src/lib/migration/parse-tagesabrechnung.test.ts` — zwei neue Cases: `restaurant`-Spalte → `locationName="Spicery"`; ohne Spalte → `null`.
- `src/lib/migration/run-import-core.test.ts` — `resolveLocationId` importieren + describe-Block (case-insens/trim, null bei leer, null bei unbekannt).
- `src/lib/migration/reconcile.test.ts` — Test-Factory `mk()` um `locationName: null` ergänzen (sonst tsc-Fehler).

## Nicht angefasst

`migration.functions.ts`, `delete-imported-shifts.ts`, `reconcile.ts`, `aggregate-by-business-date.ts`, `bootstrap-missing-staff.ts`, Bunker-Fachlogik, Auth/Rollencheck, Idempotenz, Wasserlinie, Counter-Bilanz.

## Gate

`tsc --noEmit`, `eslint`, `prettier --check`, `vitest run` müssen grün sein.
