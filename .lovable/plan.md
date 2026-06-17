## Ziel
Spalte „Vorschuss" im Tab **Lohn** (`/admin/zeit-uebersicht`) ist eine **readonly Summe der Vorschüsse aus den Tagesabrechnungen** für den ausgewählten Zeitraum/Standort. Kein manuelles Eingabefeld mehr.

## Datenquelle
`session_advances` (Tabelle existiert): `staff_id`, `amount_cents`, `session_id` → `sessions.business_date` + `sessions.location_id`. Summen pro `staff_id` im Bereich `periodStart..periodEnd` und gefiltert auf `effectiveLocationId`.

## Änderungen

### Backend — `src/lib/time/time-admin.functions.ts`
Neue Server-Fn `listAdvancesByStaff` (GET, `requireSupabaseAuth`, Manager/Admin/Payroll wie `listPayrollNotes`):
- Input: `locationId`, `periodStart`, `periodEnd`.
- Join `session_advances` × `sessions` (über `session_id`), filter `organization_id`, `sessions.location_id = locationId`, `business_date` im Bereich.
- Aggregiert in JS: `Map<staffId, totalCents>` → Rückgabe `[{ staffId, totalCents }]`.

`upsertPayrollNote` bleibt für `besonderheiten`. Das `vorschuss`-Feld in `payroll_notes` wird nicht mehr beschrieben (Default 0). Validator: `vorschuss` optional machen oder fest 0 senden; bestehende Migration unberührt.

### Frontend — `src/routes/_authenticated/admin/zeit-uebersicht.tsx`
1. Neue Query `advancesQ` (`["payroll-advances", effectiveLocationId, fromDate, toDate]`) → Map `staffId → totalCents`.
2. `PayrollRow` Vorschuss-Spalte: Input entfernen, stattdessen readonly Zelle `text-right tabular-nums` mit `fmtEuro(totalCents)`. Bei 0 dezent („–" / muted).
3. `onSave` aus `PayrollRow` schickt nur noch `besonderheiten`; `upsertMut` übergibt `vorschuss: 0` (oder Backend lässt Feld weg).
4. Nach Save Tagesabrechnung-Vorschuss ändert sich nichts hier — Invalidierung von `payroll-advances` läuft über bestehende Kasse-Mutationen unabhängig; optional: bei `staleTime: 0` im query ausreichend.

### Verhalten
- Session ohne Vorschüsse → „–"
- Mehrere Vorschüsse für Mitarbeiter im Zeitraum → Summe in EUR.
- Keine Schreibfunktion mehr → kein Lock-/Period-Konflikt für diese Spalte.

## Nicht anfassen
Tagesabrechnung-Logik, `session_advances`-Schema, `payroll_notes`-Schema, Besonderheiten-Workflow.

## Technische Details
- Aggregation server-seitig in JS (kein RPC nötig); Query: `select amount_cents, staff_id, sessions!inner(business_date,location_id)` mit Range-Filtern.
- `fmtEuro(cents)` analog zu Kasse (`(cents/100).toLocaleString("de-DE", { minimumFractionDigits: 2 })`).

## Erfolgs-Gate
- Vorschuss-Spalte zeigt korrekt Summe der Tagesabrechnungs-Vorschüsse.
- Kein Input mehr in der Spalte, keine Save-Calls für Vorschuss.
- `tsc --noEmit` 0, ESLint sauber.
