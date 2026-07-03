## Ziel

In der Wochenansicht von **Admin → Zeitübersicht** bekommt jede Mitarbeiterzeile eine neue Spalte **„Schichten"**, die die Gesamtzahl der Schichten in der aktuell gewählten Abrechnungsperiode zeigt — standortübergreifend und bereichsübergreifend summiert. Zählweise: **1 Schicht = 1 Kalendertag mit mindestens einem Zeiteintrag** (mehrere Einsätze am selben Tag ⇒ trotzdem 1).

## Umsetzung

Nur Frontend-Änderungen in `src/routes/_authenticated/admin/zeit-uebersicht.tsx`, keine neuen Server-Funktionen, keine DB-Migration.

1. **Datenquelle**
   - `getTimeOverview` liefert bereits alle Einträge der Periode für den gewählten Standort. Für die Zählung „standortübergreifend" wird pro geladenem Standort ein zusätzlicher Overview-Query pro Location parallelisiert (via `useQueries`), sobald „Alle Standorte" aktiv ist — analog zum bestehenden Wochenplan-Muster (`allLocationQueries`).
   - Bei Einzelstandort-Filter reicht das vorhandene `overviewQ`. Es wird zusätzlich (parallel) ein „shift-count-cross-location"-`useQueries` für alle übrigen Standorte gefeuert, damit die Summe wirklich standortübergreifend ist.
   - Ergebnis wird zu einer Map `staffId → Set<businessDate>` gemergt; `size` = Schichtanzahl.

2. **Übergabe an `WeeklyPlan`**
   - Neue Prop `shiftsByStaff: Map<string, number>`.
   - Wird aus dem oben gebauten Set abgeleitet und dem `WeeklyPlan` übergeben.

3. **Tabellen-Header**
   - Neue Spalte **„Schichten"** rechts neben `Mitarbeiter`, `rowSpan={2}`, rechtsbündig, tabular-nums.
   - `totalCols` von `1 + 14 + 6` auf `1 + 1 + 14 + 6` erhöhen.

4. **Tabellen-Zeile**
   - Direkt nach der Mitarbeiter-Zelle eine neue `<TableCell>` mit `shiftsByStaff.get(row.staffId) ?? 0`.
   - Gruppen-Headerzeile (Küche/Service/GL) nutzt das neue `totalCols` automatisch.

5. **Kein Einfluss auf Exports**
   - PDF/XLSX-Weekly-Export bleibt unverändert (Wochendaten). Falls gewünscht, kann die Periodensumme später ergänzt werden — nicht Teil dieses Schritts.

## Nicht enthalten

- Keine Änderung an Buchhaltungs-Tab, Perioden-Panel, Exports.
- Keine neuen Server-Funktionen, keine RLS-/DB-Änderungen.
- Keine Änderung am Schichtbegriff im Buchhaltungsteil.

## Test / Abnahme

- Wochenansicht zeigt neue Spalte „Schichten" mit Wert > 0 für Mitarbeiter mit Einträgen in der Periode.
- Wert bleibt beim Wechsel zwischen Wochen derselben Periode konstant.
- Bei Wechsel „Alle Standorte" ↔ Einzelstandort bleibt der Wert konstant (weil standortübergreifend gezählt).
- Mitarbeiter mit zwei Einträgen am selben Tag: zählt als 1.
