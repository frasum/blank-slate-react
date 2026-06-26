## Ziel

13-Wochen-Diagnose pro Mitarbeiter sichtbar machen (CSV-Spalten), **ohne** Brutto, Lohnarten oder bestehende Logik anzufassen. Reine READ-ONLY-Erweiterung zur edlohn-Verifikation.

## Neue Dateien

**`src/lib/lohn/urlaub-krank-core.ts`** — reines Modul
- `isoWeekday(isoDate)` — UTC-stabil, 0=So…6=Sa
- `deriveWorkingWeekdays(workedDates, threshold=7)` — Mehrheits-Regel über 13 Wochen
- `countWorkdaysInAbsence(absenceDates, workingWeekdays)` — Filter nach Arbeits-Wochentagen

**`src/lib/lohn/urlaub-krank-core.test.ts`** — Unit-Tests
- isoWeekday Mo/So
- deriveWorkingWeekdays Threshold-Verhalten
- countWorkdaysInAbsence Mo–Fr aus 7 Kalendertagen → 5

**`src/lib/lohn/urlaub-krank-diagnose.ts`** — Server-Helfer
- `computeUrlaubKrankDiagnose(supabaseAdmin, { staffId, fromDate, toDate, mode })`
- Berechnet `refFrom = fromDate − 91d`, `refTo = fromDate − 1d`
- Ruft `aggregateSfnPeriod` (wiederverwendet, nicht geändert) für `avgStdTag` (2 NK) und `avgSfnTagCent` (ganze Cent, je nach `mode`)
- Liest distinct `business_date` aus `time_entries` (abgeschlossen, im Ref-Fenster) → `deriveWorkingWeekdays`
- Liest `roster_absence` (`type IN ('urlaub','krank')` im Perioden-Fenster) → getrennt `urlaubTage` / `krankTage` via `countWorkdaysInAbsence`
- Rückgabe: `{ urlaubTage, krankTage, avgStdTag, avgSfnTagCent, workingWeekdays: number[] }`

## Änderungen an bestehenden Dateien (nur Durchreichung)

**`src/lib/lohn/lohn-rechner.functions.ts`**
- In `computeLohnForStaff`: `computeUrlaubKrankDiagnose(...)` aufrufen, Ergebnis in Rückgabe mergen. `zeilen`, `ergebnis`, Brutto **unverändert**.
- `berechneLohnUebersicht` Row-Typ: `urlaubTage`, `krankTage`, `avgStdTag`, `avgSfnTagCent` (alle `number | null`, Fehler-Zweig `null`).

**`src/lib/lohn/lohn-csv-export.ts`**
- `UebersichtCsvRow` um vier Felder erweitern.
- Header vor `fehler`: `urlaub_tage;krank_tage;avg_std_tag;avg_sfn_tag_cent`.
- `urlaubTage`/`krankTage` als Integer, `avgStdTag` als Dezimal, `avgSfnTagCent` als Integer formatieren.

**`src/lib/lohn/lohn-csv-export.test.ts`**
- Spaltenzahl 22 → 26 anpassen, neue Header-Zeile, Voll-/Fehler-Zeilen-Fixtures erweitern.

## Bewusst NICHT angefasst

- `berechneLohn` / `lohn-core.ts` / `types.ts` Kategorien — keine neue Lohnart, kein Brutto-Eingriff.
- `aggregateSfnPeriod`, `fixed-zeilen.ts`, SFN-/Sachbezug-/Mahlzeiten-Logik — nur Aufrufer.
- UI (`/admin/lohnrechner`) — neue Felder erscheinen nur im CSV.

## Erfolgs-Gate

`tsc --noEmit`, `format:check`, `eslint . --max-warnings=5`, `vitest run` grün inkl. neuer Tests. Vor Commit: `prettier --write` + `eslint --fix` auf geänderten Dateien.

## Offene Frage

Die roster_absence-Query nutzt service-role (supabaseAdmin) und filtert auf `staff_id` + Datumsbereich — `organization_id`-Scope ist bereits durch den vorgelagerten Staff-Org-Check in `berechneLohnUebersicht` gewährleistet. OK so, oder soll ich `organization_id` zusätzlich in der Query mitgeben (Defense-in-Depth)?
