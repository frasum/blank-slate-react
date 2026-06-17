## Ziel
Spalten **K** (Krank) und – analog dazu – **U** (Urlaub) im Tab „Lohn" (`/admin/zeit-uebersicht`) zeigen die **Anzahl Tage** aus dem Dienstplan (`roster_absence`) pro Mitarbeiter im aktuellen Zeitraum. Readonly, kein Eingabefeld.

## Datenquelle
Tabelle `roster_absence(staff_id, date, type)`. `type ∈ { 'urlaub', 'krank' }`. Kein `location_id` — Abwesenheit gilt mitarbeiterweit. Gefiltert nach `organization_id` + `date ∈ [periodStart, periodEnd]`.

## Änderungen

### Backend — `src/lib/time/time-admin.functions.ts`
Neue Server-Fn `listAbsencesByStaff` (GET, `requireSupabaseAuth`, Manager/Admin/Payroll):
- Input: `periodStart`, `periodEnd`.
- Query `roster_absence` (staff_id, date, type) im Bereich, gefiltert auf `organization_id`.
- Aggregiert pro `staff_id`: `krankDays = count(type='krank')`, `urlaubDays = count(type='urlaub')` (jeweils distinct Tage — eine Zeile pro Tag laut Schema).
- Rückgabe: `[{ staffId, krankDays, urlaubDays }]`.

### Frontend — `src/routes/_authenticated/admin/zeit-uebersicht.tsx`
1. Neue Query `absencesQ` (`["payroll-absences", organizationId, fromDate, toDate]`) — keine Location, da `roster_absence` mitarbeiterweit ist.
2. Map `staffId → { krankDays, urlaubDays }`.
3. `PayrollRow`: zusätzliche Props `urlaubDays`, `krankDays`. Spalten **U** und **K**: bei 0 dezentes „–", sonst Zahl (`tabular-nums`).

### Verhalten
- Mehrere `krank`-Tage im Zeitraum → Summe; ein Eintrag pro Tag (bestehende Schema-Logik), daher korrekt.
- Keine Schreibfunktion neu.

## Nicht anfassen
Dienstplan-Logik, `roster_absence`-Schema, Vorschuss/Besonderheiten.

## Erfolgs-Gate
- U/K zeigen korrekt Tage pro Mitarbeiter im gewählten Zeitraum.
- `tsc --noEmit` 0, ESLint sauber.
