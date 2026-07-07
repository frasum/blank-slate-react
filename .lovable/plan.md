## SP1 — Schichtbetrieb Mittag/Abend

Voraussetzung: RT1+UZ1 ist gemergt (`assertDayOpen` wird mitgenutzt, nicht geändert).

### 1) Migration

Neue Wanderung mit exakt diesen Schritten (Hausmuster: `DROP` vor `CREATE`, keine `USING (true)`):

- `ALTER TABLE public.locations ADD COLUMN day_service_enabled boolean NOT NULL DEFAULT false;`
- `ALTER TABLE public.roster_shifts ADD COLUMN service_period text NOT NULL DEFAULT 'abend' CHECK (service_period IN ('mittag','abend'));`
- Vorhandenen Unique-Constraint `roster_shifts_staff_id_location_id_shift_date_area_key` per Namen droppen und neu anlegen als
  `UNIQUE (staff_id, location_id, shift_date, area, service_period)`.
- Bestandsdaten (`service_period='abend'` per Default) bleiben eindeutig — kein Datenumbau.

Kein Anfassen von RLS, Realtime, Publication (bleibt `REPLICA IDENTITY FULL`).

### 2) Reines Modul + Tests

- Neu: `src/lib/roster/cross-booking.ts`
  - Typ `CrossBookingKind = 'conflict' | 'info'`
  - `classifyCrossBookings(rows, { locationId, area, servicePeriod })` liefert pro `(staffId, shiftDate)` Buckets:
    - **conflict**: gleicher Tag + gleiches Fenster an anderem Standort
    - **info**: gleicher Tag + anderes Fenster (legitime Doppelschicht)
- `src/lib/roster/cross-booking.test.ts`:
  - Standard-Standorte (alles `'abend'`): Verhalten wie heute — jede Fremdbuchung ist `conflict`.
  - Tagesbetrieb: Fremdbuchung im selben Fenster = `conflict`, im anderen Fenster = `info`.
  - Mehrfach-Fremdbuchungen richtig klassifiziert.

### 3) Server-Functions

`src/lib/roster/roster.functions.ts`

- `RosterShift` + `RosterCrossBooking` bekommen `servicePeriod: 'mittag' | 'abend'`.
- `getRosterShifts` / `getMyShifts` / `getStaffCrossBookings`: `service_period` mitlesen.
- `createRosterShift` / `moveRosterShift`: `servicePeriod` (Zod-Enum, Default `'abend'`) im Input.
  - Neu: Helper `assertServicePeriodAllowed(admin, locationId, servicePeriod)` — bei `'mittag'` prüft `locations.day_service_enabled`; sonst Klartext-Fehler „Standort hat keinen Tagesbetrieb aktiviert.".
  - Bestehende „max. eine Einteilung pro Tag"-Regel wird **fenster-bewusst**: gleicher Standort/Bereich im selben Fenster bleibt Duplikat; Fremdbuchung im selben Fenster bleibt Konflikt; Fremdbuchung in anderem Fenster ist erlaubt (echte Doppelschicht). `assertDayOpen` und `assertShiftDateUnlocked` bleiben davor.
  - Reihenfolge: `assertShiftDateUnlocked` → `assertDayOpen` → `assertServicePeriodAllowed` → Konflikt-Pre-Check.
- Audit-Meta: `servicePeriod` in allen betroffenen Events.

`src/lib/roster/swap.functions.ts` — nur passives Mitlesen:
- Selects um `service_period` erweitern; Konflikt-Check für Peer-Kandidaten läuft im selben Fenster (Anfragen respektieren das Fenster der Anker-Schicht).

`src/lib/locations/*` (bzw. bestehende Standort-Admin-Fn): Toggle `day_service_enabled` schreiben (Admin-Recht, Audit).

### 4) UI

- **Stammdaten → Standorte**: Zeile/Schalter „Tagesbetrieb (Mittagsservice)" neben dem Betriebskalender. Hilfetext: „Aktiviert ein zweites Planungsfenster (Mittag) im Dienstplan dieses Standorts."
- **Dienstplan-Grid** (`RosterAreaBlock` / `dienstplan.tsx`):
  - Standort hat `day_service_enabled=false` → **kein** Umschalter, Grid exakt wie heute.
  - `day_service_enabled=true` → Segmented Control „Mittag | Abend" oberhalb des Grids; Grid-Layout unverändert; `shifts`-Filter respektiert das aktive Fenster; Summenspalten je Fenster; Paint/DnD/Popover schreibt ins aktive Fenster (Payload `servicePeriod`).
- **Cross-Booking-Punkte**: statt „irgend eine Fremdbuchung = rot" jetzt via `classifyCrossBookings` — rot bei Konflikt, blau bei anderem Fenster; Tooltip „Mittag: <Standort · Bereich>" bzw. „Abend: …".
- **Öffentliches Display** (`display.$locationId.ts`): bei Tagesbetrieb-Standorten zwei Blöcke „Mittag"/„Abend" (oder in der Rotation nacheinander), sonst wie heute.
- **„Meine Schichten"** (`my-shifts.ts` + Route): Fenster-Label „Mittag"/„Abend" an der Schicht — **nur** wenn der Standort Tagesbetrieb hat (aus dem geladenen Snapshot ableiten).

### 5) Nicht anfassen

- Zeiterfassung, Kasse, Trinkgeldpool, Lohn/SFN — Ist-Zeiten bleiben fensterlos.
- `pap-2026/**`, Perioden-/Sperrlogik, PL1/PL2-Scope.
- Keine Uhrzeiten (D-1); `service_period` ist ein Fenster-Label.
- RT1-Tabellen und `assertDayOpen`.

### 6) Erfolgs-Gate

- `npx tsc --noEmit`
- `npx eslint . --max-warnings=0`
- `npx prettier --check .`
- `npx vitest run` — inkl. neuer Cross-Booking-Klassifizierungs-Tests
- DB-Test nach Hausmuster: Unique erlaubt `('mittag' + 'abend')` für gleiche `(staff, loc, date, area)`, lehnt Duplikat im selben Fenster ab.

### 7) Manuelle Abnahme (Frank)

- Spicery/YUM: kein Umschalter, Grid exakt wie heute (wichtigster Punkt).
- TSB „Tagesbetrieb" an → Umschalter erscheint, Mittag- + Abend-Schicht für gleiche Person am gleichen Tag anlegbar.
- Gleiche Person am selben Tag im selben Fenster an zwei Standorten → roter Punkt; in verschiedenen Fenstern → blauer Punkt.

Vor dem Commit: `prettier --write` + `eslint --fix`.
