## Ziel
CSV-Export für den Buchhaltungs-Tab in der Zeit-Übersicht — sichtbar **nur für die Rolle payroll** (Admin sieht ihn nicht).

## Umsetzung

1. **`src/lib/time/buchhaltung-export.ts`** — neue reine Funktion `buildBuchhaltungCsv(input: BuchhaltungExportInput): string`
   - Gleiche Spalten wie PDF/Excel (dynamisch je §3b-Modus), gleiche Aggregation.
   - Format analog `lohn-csv-export.ts`: UTF-8 BOM, Trenner `;`, Zeilenende `\r\n`, Excel-kompatibel.
   - Kopfkommentar mit Standort, Periode, Range, Modus.
   - Abteilungs-Zwischenüberschriften als eigene Kommentarzeile pro Abteilungsblock.
   - Zahlen deutsch (Komma), `besonderheiten` inkl. `absenceNote` gequotet.
   - Dateiname über bestehendes `buildBuchhaltungFileBase(...) + ".csv"`.

2. **`src/routes/_authenticated/admin/zeit-uebersicht.tsx`**
   - Import `buildBuchhaltungCsv`.
   - Neuen Handler `handleExportCsv` neben `handleExportPdf` / `handleExportXlsx` (gleiche Fehler-Toast-Behandlung).
   - In der Buchhaltungs-Karte (Zeilen 1097–1104) einen dritten Button „CSV" nur rendern, wenn `isPayroll` — Admin/Manager sehen weiterhin nur PDF + Excel.

## Was NICHT geändert wird
- Keine Server-Fn, keine DB, keine Rechten-Änderung — CSV wird clientseitig aus derselben Aggregation gebaut, die Buchhaltung heute schon rendert.
- PDF-/Excel-Buttons und deren Sichtbarkeit bleiben unverändert.
- Andere Tabs (Wochenplan, Zusammenfassung, Perioden, Brutto/Netto, Provision) unverändert.

## Testhinweis
Ein kleiner Unit-Test für `buildBuchhaltungCsv` (Header + eine Zeile pro Modus, BOM/Trenner) analog zu `lohn-csv-export`-Konvention wird mitgeliefert.
