## Ziel

Personalnummer (`staff.perso_nr`) sichtbar hinter dem Rufnamen in Wochenplan + Zusammenfassung, und Vollname + Personalnummer als eigene Spalten im Buchhaltung-Export (analog Wochenplan-Export).

## Umfang / Änderungen

**1. Server-Rows um `persoNr` erweitern**
- `src/lib/time/time-admin.functions.ts`: In den Loadern für Wochenplan (`getWeeklyPlanRows` o. Ä.) und Zusammenfassung (`getBuchhaltungRows`/Summary) beim `staff`-Select `perso_nr` mitziehen und im Row-Shape `persoNr: number | null` durchreichen. Analog dort, wo `displayName` heute belegt wird (Zeilen ~325, 935, 963, 1062, 1406, 1419).
- `src/lib/time/zeit-uebersicht-core.ts`: `persoNr?: number | null` in die betroffenen Row-Typen aufnehmen.

**2. UI — Rufname + kleine Personalnummer**
- `src/routes/_authenticated/admin/zeit-uebersicht.tsx`:
  - Neue Map `persoNrByStaffId` parallel zu `fullNameByStaffId` bauen.
  - Wochenplan-Header-Zelle (~Zeile 1533/1539): unter dem `displayName` in derselben kleinen Muted-Zeile wie der Vollname `Nr. {persoNr}` mit anzeigen (nur wenn vorhanden). Format: `Vor Nachname · Nr. 42` in einer Zeile, oder in eigener kleiner Zeile — konsistent mit bestehendem `text-xs text-muted-foreground`.
  - Zusammenfassungs-Slot (~1683 `renderStaffName`): dieselbe Nummer unter dem Namen einblenden.
- `src/components/zeit/PayrollTab.tsx`: Prop `persoNrByStaffId?: Map<string, number>` ergänzen, an `PayrollRow`/`NameCell` (Zeile 392–393) durchreichen und `Nr. {n}` in derselben kleinen Zeile wie `fullName` rendern. Aufruf in `zeit-uebersicht.tsx` (Zeile 1660) mitgeben.

**3. Buchhaltung-Export erweitert**
- `src/lib/time/buchhaltung-export.ts`:
  - `BuchhaltungExportRow` bekommt `fullName?: string` und `persoNr?: number | null`.
  - `columns(mode)` erhält direkt nach `name` zwei neue Spalten `fullName` („Vollname") und `persoNr` („Pers.-Nr."). Reihenfolge sonst unverändert.
  - `cellValue` liefert die neuen Werte; leere Werte als `""`.
  - Summenzeile: leere Zellen für die neuen Spalten.
- `src/lib/time/buchhaltung-export-columns.test.ts`: erwartete Reihenfolge um `fullName`/`persoNr` erweitern; „absenceNote ist keine Spalte" bleibt.
- Aufrufer in `zeit-uebersicht.tsx` beim Bau der Buchhaltungs-Rows füllen (aus `fullNameByStaffId` + `persoNrByStaffId`).

**4. Wochenplan-Export analog**
- `src/lib/time/weekly-export.ts`: gleicher Spalten-Nachtrag (`fullName`, `persoNr`) direkt nach dem Namen; CSV/XLSX/PDF-Zellen bauen.
- Test in `weekly-filter.test.ts`/ggf. neuer Test für Spaltenreihenfolge angleichen.

**5. Nichts anderes anfassen**
Suchfilter (`weekly-filter.ts`) matcht weiter nur auf `displayName` — Personalnummer bewusst nicht in die Suche, außer explizit gewünscht.

## Technische Details

- Datenquelle: bestehendes Feld `staff.perso_nr` (`number | null`, bereits im generierten Typ vorhanden). Keine Migration, keine RLS-Änderung.
- Anzeige-Format: `Nr. {persoNr}`; wenn `null`, wird nichts gerendert und im Export bleibt die Zelle leer.
- Keine Änderungen an Gehalts-/Zeit-Berechnungen, an §3b-Logik oder an Berechtigungen.

## Gates

`tsc --noEmit` grün, `eslint . --max-warnings=0` grün, `vitest run` grün (inkl. angepasstem Column-Test), `prettier --check .` grün.
