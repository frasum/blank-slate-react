## Ziel
CSV-Export der Arbeitsstunden für Admin **und** Payroll in beiden Tabs (Zusammenfassung + Buchhaltung) sichtbar machen. Kein neuer Serialisierer — es wird der vorhandene Helfer `buildBuchhaltungCsv` / `buildBuchhaltungFileBase` aus `src/lib/time/buchhaltung-export.ts` wiederverwendet (ein Helfer, alle Ausgabewege identisch, inkl. Viertelstunden-Abrundung BH1).

## Änderungen

### 1. `src/routes/_authenticated/admin/zeit-uebersicht.tsx`
- **Zusammenfassung-Tab (ca. Zeile 1312–1319):** Neben PDF- und Excel-Button einen dritten Button „CSV" ergänzen, verdrahtet mit dem bereits existierenden `handlePayrollExportCsv`. Damit nutzt Zusammenfassung dieselbe Datenquelle (`buchhaltungExportInput`) und denselben §3b-Modus wie PDF/Excel.
- Icon `Download` aus `lucide-react` mitverwenden (bereits in PayrollTab genutzt).

### 2. `src/routes/_authenticated/admin/zeit-uebersicht.tsx` (PayrollTab-Aufruf, Zeile ~1706–1708)
- Aktuell: `onExportCsv={isPayroll ? handlePayrollExportCsv : undefined}`
- Neu: `onExportCsv={handlePayrollExportCsv}` — CSV-Button auch für Admin im Buchhaltung-Tab.

### 3. Keine Änderung an
- `src/components/zeit/PayrollTab.tsx` (Button rendert bereits konditional auf `onExportCsv`).
- `src/lib/time/buchhaltung-export.ts` (Serialisierer, Spalten, Rundung bleiben unverändert).
- Server/DB/Rechte-Logik — es ist ein reiner Client-Export der ohnehin sichtbaren Daten.

## Nicht-Ziele
- Kein separater Netto-/Brutto-CSV (dafür gibt es `lohn-csv-export.ts` an anderer Stelle).
- Keine neuen Spalten, keine geänderte Rundung, kein neues Format.

## Verifikation
- `tsgo` auf die geänderte Datei.
- Bestehende Tests `buchhaltung-export-columns.test.ts` und `buchhaltung-export-quarter.test.ts` bleiben grün (kein Helfer-Change).
- Manuell: In Zusammenfassung als Admin PDF/Excel/CSV — alle drei liefern denselben Dateibasis-Namen (`Buchhaltung_<Standort>_<Periode>[_3b]`) und identische Zahlen.
