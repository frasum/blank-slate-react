# RT1 + UZ1 — Betriebskalender & Urlaubszählung mit Feiertags-Regel

Umfangreicher Bauplan-Schritt: Schema, reine Module, Server-Fns, mehrere UI-Stellen. Umsetzung in einer Reihenfolge, in der jeder Zwischenschritt für sich lauffähig ist.

## 1. Migration (approval-pflichtig)

Eine Migration mit:
- `public.location_rest_days` (org_id, location_id, weekday 1–7, UNIQUE(location_id, weekday))
- `public.location_calendar_exceptions` (org_id, location_id, date, kind IN ('closed','open'), reason, UNIQUE(location_id, date))
- Beide: RLS an, KEINE Client-Policies, `REVOKE ALL … FROM PUBLIC, anon, authenticated`, `GRANT ALL … TO service_role` (deny-all-Hausmuster). Doku-Inventur wächst auf **zwanzig**.
- `organization_settings.count_holidays_as_leave boolean NOT NULL DEFAULT false`

## 2. Reine Module (+ Vitest)

**`src/lib/roster/business-calendar.ts`** (neu)
- `isoWeekday(dateIso: string): number` (Mo=1 … So=7)
- `isClosedDay(dateIso, restWeekdays: number[], exceptions: Map<string,'closed'|'open'>): boolean`
- Regel: Ausnahme schlägt Wochentag. Kombitests: (Ruhetag & keine Ausnahme) / (Ruhetag & open) / (Nicht-Ruhetag & closed) / (Nicht-Ruhetag & keine).

**`src/lib/time/shift-hours.ts`**
- `bavarianHolidayMap` exportieren (bislang lokal). Keine Logik-Änderung.

**`src/lib/roster/leave-requests.ts`**
- `countLeaveDays(start, end, holidayDates?: Set<string>)`: Feiertage im Zeitraum abziehen, min 0. Ohne Parameter identisches Verhalten → bestehende Tests bleiben unangetastet grün. Neue Tests: Feiertag mittendrin / am Rand / mehrere / keiner / alle Tage Feiertage.

## 3. Server-Functions

**`src/lib/roster/business-calendar.functions.ts`** (neu)
- `getLocationCalendar({ locationId, startDate, endDate })` — read, Rollen wie Roster-Reads → `{ restWeekdays: number[], exceptions: { date, kind, reason }[] }`.
- `setRestDays({ locationId, weekdays })` — manager+ via `runWithPermission("locations.manage")` (bestehendes Recht), Cross-Org-Guard, Audit.
- `upsertCalendarException({ locationId, date, kind, reason })` — dito.
- `deleteCalendarException({ id })` — dito.

**`business-calendar.server.ts`** (Helper)
- `assertDayOpen(supabaseAdmin, locationId, shiftDate)` — lädt rest_days + exception für den Tag, wirft `Error("Ruhetag/geschlossen (…)")` wenn zu. VOR Schreiben, ohne Audit bei Ablehnung.

**Roster-Schreib-Fns** (`roster.functions.ts`, `swap.functions.ts` soweit relevant)
- Bei Anlegen/Verschieben/Bestätigen: `assertDayOpen` einhängen. Löschen bleibt frei.

**Urlaubs-Fns**
- `leave.functions.ts` (`requestLeave`, `listLeaveRequests`, `getMyLeaveRequests`) und `vacation-planner.functions.ts`: Setting `count_holidays_as_leave` laden. Wenn false → für Zeitraum via `bavarianHolidayMap` Feiertags-Set bilden und an `countLeaveDays` übergeben.

## 4. UI

**Stammdaten → Standorte** — neue Sektion „Betriebskalender" pro Standort:
- 7 Checkboxen Wochentage (Ruhetage), Ausnahmen-Liste mit Datum + Art (`closed`/`open`) + Grund, Hinzufügen/Löschen.

**Dienstplan-Grid** (`RosterGrid`, `PlanerRosterView`):
- Geschlossene Tage grau, Paint/Drag/Popover-Anlage clientseitig blockiert.
- Bestehende Schichten dort: roter Rahmen + Tooltip „Standort geschlossen", löschbar.

**Öffentliches Display (D3)** (`src/routes/api/public/display.$locationId.ts` / Renderer): geschlossene Tage als „Ruhetag".

**Urlaub** (Dialoge, Listen, Jahresplaner): Tage-Anzeige „X Urlaubstage (Y Feiertage nicht gezählt)" wenn Y > 0.

**Einstellungen (Org)** (`ArbeitgeberSection` oder eigene Sektion): Schalter „Feiertage zählen als Urlaubstage" (Default aus) mit Hilfetext inkl. Hinweis auf Live-Neuberechnung älterer Anträge.

**Stempeluhr**: nur dezenter Hinweis „Heute ist Ruhetag" beim Einstempeln, kein Block.

## 5. Nicht angefasst

`bavarianHolidayMap`-Logik selbst, SFN/Lohn-Geldpfad, `pap-2026/**`, Kasse, Trinkgeldpool, Statistik (→ RT2), Zeit-Schreibpfade außer Hinweis, Perioden-/Sperrlogik.

## Erfolgs-Gate

`tsc --noEmit`, `eslint --max-warnings=0`, `prettier --check .`, `vitest run` grün. Manuelle Abnahme wie im Auftrag beschrieben.

## Reihenfolge der Umsetzung

1. Migration einreichen (Approval abwarten).
2. Reine Module + Tests.
3. Server-Fns (Kalender + Guard einhängen + Urlaub anpassen).
4. UI-Stellen (Standorte-Sektion → Grid-Overlay → Display → Urlaubs-Anzeigen → Org-Schalter → Stempel-Hinweis).
5. Lint/Format/Tests, dann Abnahme.
