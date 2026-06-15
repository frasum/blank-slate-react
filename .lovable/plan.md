# Umbau /admin/zeit-uebersicht — komplette Shell + neuer Wochenplan

Ziel: UI der Referenz (Tabs oben, Monat-Dropdown + Location-Pills + PDF/Excel rechts, Wochen-Chips W1–W5, Suchfeld, Wochen-Tabelle mit getrennten Anfang/Ende-Spalten pro Tag) 1:1 nach `/admin/zeit-uebersicht` übernehmen.

## Server (keine Migrationen, keine neuen Tabellen)

Bestehende Server-Functions bleiben unverändert: `getTimeOverview`, `getWeeklyTimeEntries`, `listLocations`, `listPeriods`, `listPayrollNotes`, `upsertPayrollNote`, `setTimeEntryShift`, `createTimeEntryShift`, `createPeriod`, `togglePeriodLock`, `deletePeriod`. Domänenlogik (`computeShiftHours`, `isBavarianHoliday`) unverändert.

## Header-Shell (oberhalb der Tabs)

Alte Filter-Karte (Standort/Von/Bis/Periode-Dropdown) entfällt **für den Wochenplan-Tab**. Für `Zusammenfassung`, `Buchhaltung`, `Perioden` bleibt eine kompakte Filter-Zeile (Periode + Von/Bis) erhalten, weil diese Tabs einen Zeitraum brauchen.

Tab-Reihenfolge: `Wochenplan | Zusammenfassung | Buchhaltung | Perioden | Brutto/Netto | Provision`. Letzte beide als Platzhalter-Tabs mit „in Vorbereitung"-Karte.

## Wochenplan-Header (neu)

Zeile 1:
- Monat-Dropdown (z. B. „Juni 2026") — steuert, welche ISO-Wochen als Chips erscheinen (alle KW, die mind. einen Tag des Monats enthalten).
- Location-Pills, **dynamisch** aus `listLocations()` + Pill „Alle" (Aggregation aller Standorte). Aktiv = solid, inaktiv = ghost.
- Rechtsbündig: Buttons `PDF` und `Excel`, beide exportieren die aktuell sichtbare Wochen-Tabelle.

Zeile 2:
- Wochen-Chips `W1 (26.05.–31.05.)` … `W5 (22.06.–25.06.)`, dynamisch aus dem gewählten Monat. Klick = `weekStart` setzen.

Zeile 3:
- Mitarbeiter-Suchfeld (Client-Filter auf `displayName`, case-insensitive).

State: `selectedMonth` (`YYYY-MM`, Default = aktueller Monat), `selectedLocationId | "all"`, `weekStart` (ISO Montag), `query`.

## Wochen-Tabelle (Layout)

Spalten: `Mitarbeiter` | je Tag **zwei Sub-Spalten** (`Anfang`/`Ende`) | `Ges` | `20–24` | `24–x` | `So/Fei` | `U` | `K`.

Pro Tageszelle:
- Schicht vorhanden → zwei Zellen mit `HH:MM` / `HH:MM` (mehrere Schichten gestapelt). Klick öffnet bestehenden `ShiftEditorDialog`.
- Keine Schicht, aber Cross-Location-Indikator → `×` (heller, mittig, hellgelber Hintergrund).
- Leer + Admin → klickbares `+` zum Anlegen.

Departement-Trennzeilen (Küche / Service / Geschäftsleitung) als gefärbte Header-Reihen (`bg-orange-50/blue-50/gray-50` wie heute), kleiner Akzent-Balken links pro Mitarbeiterzeile.

„Alle"-Modus: Einträge aller Standorte aggregiert (zweite Server-Query je Location parallel via React Query, dann clientseitig mergen). Cross-Location-`×` entfällt im Alle-Modus.

## Exporte

- **Excel**: Paket `exceljs` neu (kein bestehendes XLSX-Tool im Repo). Datei: `Wochenplan_<Location>_KW<NN>_<YYYY>.xlsx`. Spalten exakt wie UI, Department-Trennzeilen mit Fettdruck, Sonn-/Feiertage farbig hinterlegt, Spaltenbreiten autosize.
- **PDF**: `jsPDF` + `jspdf-autotable` (bereits installiert). Querformat A4, gleiche Spalten, gleicher Dateiname `.pdf`. Header mit Location + KW + Zeitraum.

Beide Generatoren als pure Funktionen in `src/lib/time/weekly-export.ts` (`buildWeeklyXlsx`, `buildWeeklyPdf`) — testbar, ohne React-Abhängigkeit.

## Tabs Brutto/Netto + Provision

Platzhalter-Karten mit Hinweis „Wird im nächsten Schritt umgesetzt". Kein Backend-Aufruf.

## Nicht Teil dieses Umbaus

- Keine Änderung an `getWeeklyTimeEntries` / DB-Schema.
- Keine neuen RLS-Policies.
- Inhalt von `Zusammenfassung`, `Buchhaltung`, `Perioden` bleibt funktional unverändert (nur ggf. minimaler Spacing-Fix).
- Brutto/Netto- und Provisions-Logik kommt in separatem Auftrag.

## Reihenfolge der Umsetzung

1. `bun add exceljs` (für Excel-Export).
2. `src/lib/time/weekly-export.ts` mit `buildWeeklyXlsx` + `buildWeeklyPdf` + Unit-Helfern.
3. `zeit-uebersicht.tsx` umbauen: neue Header-Shell, neue Wochenplan-Tabelle (Anfang/Ende-Spalten, Suche, Pills, Monats-Chips, Export-Buttons). Bestehende Tabs/Dialog bleiben.
4. tsc + Smoke-Test im Preview.
