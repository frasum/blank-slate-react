# Buchhaltung-Tab: §3b-Detailspalten + PDF/Excel-Export

Verstanden — Perioden-Tab (B7) und Daten-Aggregation existieren bereits. **Kein Neubau**, nur additive Erweiterung des bestehenden `payroll`-Tabs in `src/routes/_authenticated/admin/zeit-uebersicht.tsx`.

## Nicht angefasst

- `periods`-Tab und `togglePeriodLock`
- `getTimeOverview`, `upsertPayrollNote`, `computeShiftHours`, `shift-hours.ts`, `holiday-rate.ts`, `sfn-geld.ts`, `sfn-rates.ts`
- Tabs `brutto-netto` und `provision`
- Keine neue Server-Function, keine Migration, kein `bun add xlsx`, keine zweite Feiertagsliste

## Aufgaben

### 1) §3b-Toggle in der Buchhaltung-Toolbar
Toggle „Einfach / §3b" mit Kurzerklärtext (Layout-Vorlage Legacy `ZtBuchhaltung.tsx`). Steuert Sichtbarkeit der §3b-Spalten. Monatsauswahl/Standort-Pills bleiben.

### 2) So/Fei-Split in `staffAggs`
Pro Eintrag mit `businessDate` zusätzlich zu `evening/night/sunHol` aufschlüsseln:
- `bavarianHolidaySurchargeRate(date) >= 1.5` → `feiertag150 += sundayHolidayHours`
- sonst wenn `isBavarianHoliday(date)` → `feiertag += …`
- sonst wenn Sonntag (`isSundayOrHoliday`, kein Feiertag) → `sonntag += …`

`sunHol` bleibt als Summe für die „SO/FEI"-Spalte im Einfach-Modus erhalten. Keine eigene Feiertagsableitung.

### 3) Spalten + Footer im payroll-Tab
Header und `PayrollRow` erweitern (Layout an Legacy `BuchhaltungTableHead`/`BuchhaltungRow` angelehnt); U/K/Vorschuss/Besonderheiten bleiben.
- **Immer (SFN):** 20–24 (`evening`), 24–X (`night`), SO/FEI (`sunHol`)
- **Nur §3b:** Sonntag, Feiertag, Feiertag 150 %
- Neue **Footer-Zeile** mit Spaltensummen (Vorlage `BuchhaltungFooter`)
- Spalten-Tooltips via neuem `SfnTooltipHeader` (additive Datei)

### 4) Suchfeld „Mitarbeiter suchen…"
Falls noch nicht vorhanden: unter der Toolbar; bei aktiver Suche Abteilungs-Header ausblenden.

### 5) PDF + Excel-Export (Toolbar rechts)
Additive Exporter unter `src/lib/time/` (z. B. `buchhaltung-export.ts`), gebaut mit **ExcelJS** + **jsPDF/jspdf-autotable** analog `weekly-export.ts`. Inhalt = sichtbare Tabelle inkl. §3b-Spalten je nach Modus. Kein `xlsx`, kein Provisions-Parameter.

## Vor dem Commit
`npx prettier --write` + `npx eslint --fix` über geänderte Dateien.

## Erfolgs-Gate
- `tsc --noEmit`, `eslint .`, `prettier --check .`, `vitest run` grün
- §3b-Toggle blendet Sonntag/Feiertag/Feiertag-150 %-Spalten ein/aus; Einfach-Modus zeigt nur 20–24/24–X/SO-FEI
- Footer-Summen = Spaltensummen der sichtbaren Zeilen
- PDF + Excel erzeugen je eine Datei mit den sichtbaren Spalten
- Keine neuen Pakete, keine Migration
- `periods`-Tab, `togglePeriodLock`, `upsertPayrollNote` unverändert
- Stichprobe: Eintrag am 25.12. → Feiertag 150 %, normaler Sonntag → Sonntag
