## Ziel

In den Tabs **Zusammenfassung** und **Buchhaltung** (`/admin/zeit-uebersicht`) sollen alle aktiven Mitarbeiter des jeweiligen Standort-Filters angezeigt werden — auch wenn sie in der Periode keine `time_entries` und keine `roster_shifts` haben (also 0 h, keine SFN, keine Notizen). Heute erscheinen nur Personen, die mindestens einen Zeit-Eintrag in der Periode haben.

## Aktueller Stand

- `staffAggs` in `src/routes/_authenticated/admin/zeit-uebersicht.tsx` (Zeile ~436) wird ausschließlich aus `overviewEntries` (= `time_entries` der Periode) aufgebaut. Wer nichts gestempelt hat, fehlt in beiden Tabs.
- `byDept` (Zusammenfassung) und `buchhaltungStaffRows` (Buchhaltung) leiten sich direkt aus `staffAggs` ab.
- `listStaff()` liefert bereits alle aktiven Mitarbeiter mit `isActive` und `locationDepartments: { locationId, department }[]` — genau die Granularität, die die Tabellen brauchen (eine Zeile pro Mitarbeiter × Abteilung).

## Änderungen (nur Frontend, ein File)

**Datei:** `src/routes/_authenticated/admin/zeit-uebersicht.tsx`

1. **Zusätzliche Query** `staffAllQ` via bestehender `listStaff` Server-Fn (Query-Key `["admin-staff-all"]`). Kein neuer Server-Endpoint.

2. **`staffAggs` seedet aus `listStaff` vor dem Einlesen der Einträge:**
   - Kandidatenmenge: alle `isActive === true` Mitarbeiter.
   - Standort-Filter:
     - `isAllLocations`: alle aktiven Mitarbeiter mit mindestens einem `locationDepartments`-Eintrag; pro Kombination `(staffId, department)` (dedupliziert über alle Standorte) wird eine leere `StaffAgg`-Zeile angelegt.
     - Konkreter Standort: nur `locationDepartments`-Zeilen mit `locationId === effectiveLocationId`; eine Zeile je vorkommender `department` dort.
   - Anschließend werden `overviewEntries` wie bisher in die Map einsortiert; der Key bleibt `staffId` (konsistent mit dem heutigen Verhalten, das die Abteilung des ersten Entry-Vorkommens beibehält). Wenn eine Person Einträge in einer anderen Abteilung als der Stammdaten-Zuordnung hat, gewinnt weiterhin die aus den Einträgen abgeleitete Abteilung (kein Regressions-Risiko für heute sichtbare Zeilen).
   - Ergebnis: Personen ohne Einträge erscheinen mit `totalHours = 0`, leerer `perWeek`, leerem `shiftDates`. Sortierung nach `displayName` bleibt.

3. **Buchhaltung:** `buchhaltungStaffRows` (~Zeile 888) läuft bereits über `staffAggs`. `sfnByStaff`, `notesByStaff`, `advanceCentsByStaff`, `absencesByStaff` liefern via `Map.get(...)` sauber `undefined`/0-Fallbacks — Zeilen ohne Daten zeigen also Nullen. Keine weitere Anpassung nötig.

4. **Wochenplan-Tab bleibt unberührt** — dort ist die Roster-Sicht bereits standardmäßig kompletter (`assignedStaff` aus `weeklyData`). Der Fix zielt bewusst nur auf Zusammenfassung + Buchhaltung, wie beauftragt.

5. **Empty-State-Zeile** ("keine Daten") bleibt logisch: entfällt implizit, sobald Mitarbeiter existieren; die Meldung erscheint nur noch, wenn die Org gar keine aktiven Mitarbeiter für den Filter hat.

## Nicht enthalten

- Keine Änderungen an Server-Funktionen, Exporten (`buildBuchhaltungXlsx/Pdf/Csv` bekommen weiterhin dieselben Row-Shapes), Tests-Fixtures oder Datenbank.
- CP1/BL1/PY2-T bleiben unberührt.

## Abnahme

- `/admin/zeit-uebersicht`, "Alle Standorte", aktuelle Periode: Personen wie z. B. PIM (die im Screenshot mit 8:00 h nur wegen eines Eintrags erscheinen) und Kollegen ohne jegliche Einträge sind sichtbar (0:00, „—").
- Standort-Filter Spicery/YUM/TSB: pro Standort erscheinen alle dort zugeordneten aktiven Mitarbeiter (mit ihren dortigen Abteilungen), auch ohne Einträge.
- `tsgo`, `eslint`, `prettier`: 0.
