## Ziel

Beim Eintragen von Urlaub oder Krankheit wird statt eines einzelnen Tages ein Zeitraum (Von / Bis) gesetzt. Im Zeitraum vorhandene Schichten desselben Mitarbeiters werden automatisch entfernt.

## UX im Zell-Popover

Klick auf „Urlaub eintragen" oder „Krank eintragen" wechselt das Popover auf einen kleinen Eingabemodus:

```text
Urlaub eintragen
Von   [ 15.06.2026 ]
Bis   [ 19.06.2026 ]
Hinweis: 3 Schichten im Zeitraum werden entfernt.
[ Abbrechen ]  [ Eintragen ]
```

- „Von" wird mit dem geklickten Tag vorbelegt, „Bis" identisch (Standard = 1 Tag).
- Beide Felder sind Shadcn-Datepicker im Popover (`pointer-events-auto`).
- Validierung: `Bis >= Von`, sonst Button disabled.
- Live-Hinweis: Anzahl der Schichten dieses Mitarbeiters im gewählten Zeitraum (aus dem bereits geladenen `shifts`-Array, kein Roundtrip).
- Bestehende Buttons „Urlaub entfernen" / „Krank entfernen" entfernen weiterhin nur den geklickten Tag.

Identisches Verhalten im Pillen-Popover (Klick auf Schicht).

## Datenmodell

Keine Schema-Änderung. `roster_absence` bleibt ein Eintrag pro `(staff_id, date)`. Der Zeitraum wird serverseitig in einzelne Tageseinträge expandiert. Das hält Anzeige (`absenceMap`), Realtime und Auswertungen unverändert.

## Server-Funktion `setAbsenceRange`

Neue Funktion in `src/lib/roster/roster.functions.ts`, parallel zu `setAbsence`:

- Input: `{ staffId, fromDate, toDate, type: 'urlaub' | 'krank' }`, Zod-validiert, `toDate >= fromDate`, max. Spannweite z. B. 92 Tage als Schutz.
- Rolle: `manager`+ (wie `setAbsence`).
- Ablauf (Service-Role):
  1. Tagesliste aus `[fromDate, toDate]` generieren (UTC-sicher).
  2. `upsert` auf `roster_absence` mit allen Tagen (`onConflict: staff_id,date`) → setzt/überschreibt `type`.
  3. `delete` auf `roster_shifts` für `staff_id = X AND shift_date BETWEEN from AND to` (im Org-Scope). Greift auf alle Standorte/Areas, weil Abwesenheit mitarbeiterweit ist.
  4. Audit-Eintrag mit `action: 'roster_absence.set_range'`, `meta: { staffId, fromDate, toDate, type, deletedShiftCount }`.
- Rückgabe: `{ ok: true, deletedShiftCount, daysCount }` für Toast-Feedback.

`setAbsence` (Einzeltag) bleibt bestehen für Abwärtskompatibilität, wird aber vom UI nicht mehr aufgerufen — das Popover ruft immer `setAbsenceRange`.

## Frontend-Anpassungen

`src/routes/_authenticated/admin/dienstplan.tsx`:
- `handleSetAbsence` → `handleSetAbsenceRange(staffId, from, to, type)`. Invalidiert `roster-absence` UND `roster-shifts`. Toast: „Urlaub für 5 Tage eingetragen, 2 Schichten entfernt".
- Realtime-Subscription auf `roster_shifts` ist bereits vorhanden — Grid aktualisiert sich selbst.

`src/components/roster/CellQuickPopover.tsx` und `PillConfirmPopover.tsx`:
- Neuer interner State `mode: 'menu' | 'range-urlaub' | 'range-krank'`.
- Im Range-Modus: zwei Datepicker, Hinweistext mit Schichtanzahl, „Eintragen"/„Abbrechen".
- Prop-Signatur: `onSetAbsenceRange: (from: string, to: string, type) => Promise<void>` ersetzt `onSetAbsence`. „Entfernen" bleibt einzeltagsbezogen.
- Damit der Schicht-Konflikthinweis berechnet werden kann: zusätzliche Prop `shiftsForStaff: Array<{ shiftDate: string }>` (aus `shifts` in `RosterGrid` gefiltert nach `staffId`).

`src/components/roster/RosterGrid.tsx`:
- Reicht `shiftsForStaff` und die neue Callback-Signatur durch.

## Edge Cases

- „Krank" über einen Zeitraum, in dem teilweise schon „Urlaub" steht → wird mit `upsert` auf `krank` überschrieben (gewollt: zuletzt eingetragener Typ gewinnt pro Tag).
- Wochenenden im Zeitraum: zählen mit (kein Sonderhandling — Restaurantbetrieb).
- Periode gesperrt (`periodLocked`): „Eintragen"-Button disabled, wie bisher bei anderen Edits.

## Verifikation

- `npx prettier --write` + `npx eslint --max-warnings=0` auf geänderte Dateien.
- Manueller Test: 1) Urlaub Mo–Fr eintragen → 5 grüne Schirme, geplante Schichten weg. 2) Krank Mi–Do überschreibt → Mi/Do werden rot. 3) Einzeltag-„Entfernen" auf Mi → nur Mi wird leer.

## Nicht im Scope

- Bearbeiten eines bestehenden Zeitraums als Block (Verlängern/Kürzen) — bleibt manuell pro Tag.
- Halbe Tage, Stundenangaben.
- Schema-Erweiterung um `absence_periods`-Tabelle (bewusst weggelassen, um Anzeige/Realtime unverändert zu lassen).
