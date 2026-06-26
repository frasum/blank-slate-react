## Ziel

Auf `/admin/lohnrechner` einen Button **„CSV exportieren"** ergänzen, der die aktuell geladene Perioden-Übersicht als CSV (UTF-8 BOM, `;`-getrennt, `\r\n`) herunterlädt — mit allen Feldern für den Lohnbüro-Abgleich (Perso-Nr., SFN-Stunden-Töpfe, alle Steuer-/SV-Komponenten in Cent). Es wird **nichts neu gerechnet** — die Werte fallen in `computeLohnForStaff` bereits an und werden nur durchgereicht.

---

## Änderungen

### 1) `src/lib/lohn/lohn-rechner.functions.ts` — `berechneLohnUebersicht` erweitern

- Staff-Query um `perso_nr` ergänzen: `.select("id, display_name, first_name, last_name, perso_nr")`.
- `Row`-Typ um folgende Felder erweitern (alle `number | null`):
  - `persoNr`
  - `night25Hours`, `night40Hours`, `sundayHours` (aus `r.buckets`)
  - `lstCent`, `soliCent`, `kistCent`, `kvCent`, `rvCent`, `avCent`, `pvCent` (aus `r.ergebnis`)
- Erfolgs-Zweig: neue Felder aus `r.buckets` / `r.ergebnis` befüllen; `persoNr: s.perso_nr ?? null`.
- Fehler-Zweig (`catch`): `persoNr` setzen, alle neuen Zahlenfelder `null`.
- UI-Tabelle bleibt unverändert (neue Felder sind nur für den Export).

### 2) `src/lib/lohn/lohn-csv-export.ts` — neu, reines Modul

- Exportiert `UebersichtCsvRow` (Shape exakt wie im Prompt) und `buildUebersichtCsv(rows, { periodLabel, mode }): string`.
- Format:
  - UTF-8 BOM `\uFEFF` voran, Trenner `;`, Zeilenende `\r\n`.
  - Zeile 1 (Kommentar): `# COCO Lohn-Übersicht; Periode=<periodLabel>; Modus=<mode>`
  - Zeile 2 (Header, exakt):
    `perso_nr;name;stunden;stundensatz_cent;nacht25_std;nacht40_std;sonntag_std;zuschlag_cent;brutto_cent;lst_cent;soli_cent;kist_cent;kv_cent;rv_cent;av_cent;pv_cent;netto_cent;auszahlung_cent;fehler`
  - Geld als ganzzahlige Cent, Stunden als Dezimal mit Punkt (`12.5`), `null` → leere Zelle.
  - CSV-Escaping: Felder mit `;`, `"`, `\r` oder `\n` in `"…"`, enthaltene `"` verdoppeln.

### 3) `src/lib/lohn/lohn-csv-export.test.ts` — neu

- Header-/Kommentarzeile exakt.
- Voll-Zeile: Cent als Ganzzahl, Stunden mit Punkt, korrekte Spaltenanzahl (19).
- Fehler-Zeile: Zahlenspalten leer, `name`+`fehler` gesetzt, Escaping greift bei `name` mit `;`.

### 4) `src/routes/_authenticated/admin/lohnrechner.tsx`

- Button **„CSV exportieren"** (`variant="outline"`) bei der Übersichts-Tabelle.
- `disabled`, wenn `uebersichtQ.isLoading` oder keine Rows.
- onClick: `buildUebersichtCsv(uebersichtQ.data.rows, { periodLabel, mode })` → `downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), "lohn-uebersicht_<periodLabel-sanitized>_<mode>.csv")`. `downloadBlob` ist bereits importiert.
- `periodLabel` aus der aktuell gewählten Periode (`periodsQ.data.find(p => p.id === periodId)?.label`); Slashes/Spaces im Dateinamen durch `-`/`_` ersetzen.

---

## NICHT ANFASSEN

- Rechenlogik (`aggregateSfnPeriod`, `berechneLohn`, `computeLohnForStaff`-Verhalten).
- Rückgabe-Shape von `berechneLohnFuerMitarbeiter`.
- `lohn-excel-export.ts` (nur `downloadBlob` wiederverwenden).
- Permissions/RLS/Schema — keine Migration.

## Erfolgs-Gate

`tsc --noEmit`, `format:check`, `eslint . --max-warnings=5`, `vitest run` grün (inkl. `lohn-csv-export.test.ts`). Manuell: Periode wählen → Knopf lädt `.csv` mit BOM, `;`-getrennt, 19 Spalten, `perso_nr` gefüllt, Cent-Werte ganzzahlig, Fehler-MA mit leeren Zahlen + `fehler`-Text.
