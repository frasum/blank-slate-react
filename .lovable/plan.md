## Ziel

Navigation analog thaitime:
- **‹‹ / ››** → ganze Periode zurück/vor (wie bisher).
- **‹ / ›** → das angezeigte 4-Wochen-Fenster um 14 Tage verschieben (Halb-Periode), inkl. korrektem Wechsel über Perioden­grenzen hinweg.
- **Heute** → springt zur aktuellen Periode, Halb-Offset zurück auf 0.

## Konzept

`effectivePeriod` bleibt für Geschäfts­semantik (Lock-Status, Saldo, Zuordnung zur DB-Periode) erhalten. Zusätzlich gibt es einen `halfOffset: boolean`:
- `false` → `windowStart = period.start`, `windowEnd = period.end`
- `true`  → `windowStart = period.start + 14 d`, `windowEnd = period.end + 14 d`

Alle Queries (`getRosterShifts`, `getAvailability`, `getAbsences`, `getStaffCrossBookings`) bekommen `windowStart/windowEnd` statt `period.start/end`. Das Grid zeigt entsprechend die verschobenen Tage.

Bei `›` mit `halfOffset = true` → neue Periode + `halfOffset = false`.  
Bei `‹` mit `halfOffset = false` → vorherige Periode + `halfOffset = true`.

Das ist exakt das Schema aus thaitime (`useScheduleBillingNavigation`).

## Änderungen

**`src/components/roster/PeriodNav.tsx`**
- Neue Props: `halfOffset: boolean`, `onPrevPeriod()`, `onNextPeriod()`, `onPrevHalf()`, `onNextHalf()`, `onToday()`.
- Buttons rufen dedizierte Handler statt eines generischen `onSelect`.
- Label: wenn `halfOffset` → z. B. „Juni/Juli 2026", sonst „Juni 2026".
- Edge-Disable: `‹‹` disabled wenn erste Periode + halfOffset=false; `›` disabled wenn letzte Periode + halfOffset=true; usw.

**`src/routes/_authenticated/admin/dienstplan.tsx`**
- Neuer State `halfOffset: boolean`.
- Abgeleitet: `windowStart`, `windowEnd` (period.start/end ± 14 Tage in ISO).
- `days = daysBetween(windowStart, windowEnd)`.
- Query-Keys & `data` benutzen `windowStart/windowEnd` statt `period.startDate/endDate`.
- Realtime-Channel-Key bleibt locationId.
- Handler-Funktionen:
  - `toToday()` → setze `periodId` auf heutige Periode, `halfOffset=false`.
  - `prevPeriod()` / `nextPeriod()` → ändere `periodId` über `periods`-Index, `halfOffset=false`.
  - `prevHalf()` / `nextHalf()` → folge thaitime-Logik (Toggle + ggf. Periode wechseln).
- Header bleibt unverändert; PeriodNav weiterhin zentriert über dem Grid.

## Nicht angefasst

- Periode-Lock-Semantik (locked-Hinweis bezieht sich weiterhin auf `effectivePeriod`).
- Server-Functions, RLS, Datenmodell.
- Skill-Filter, Paint, Standort-Buttons, Pillen-Farben.

## Erfolgskriterium

- ‹‹/›› wechseln Periode komplett.
- ‹/› schieben das Datumsfenster um 14 Tage; an Periodengrenzen springt die zugehörige `effectivePeriod` mit.
- „Heute" setzt alles auf die aktuelle Periode zurück.
- `tsc --noEmit`, prettier, eslint grün.
