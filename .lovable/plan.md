## Problem

In `listAdvancesByStaff` (`src/lib/time/time-admin.functions.ts`) wird auf `sessions.location_id = data.locationId` gefiltert. Abwesenheiten (`listAbsencesByStaff`) sind dagegen org-weit. Ein Mitarbeiter, der an mehreren Standorten arbeitet, bekommt in der Standort-Ansicht nur einen Teil seiner Vorschüsse abgezogen → Netto-Lohn zu hoch.

## Fix (minimal, geld-relevant)

`listAdvancesByStaff` org-weit machen — analog zu `listAbsencesByStaff`:

1. `locationId` aus dem Zod-Input **entfernen**.
2. Den Filter `.eq("sessions.location_id", data.locationId)` **entfernen**; `organization_id` + `business_date ∈ [periodStart, periodEnd]` bleiben.
3. Aufrufseite in `src/routes/_authenticated/admin/zeit-uebersicht.tsx` (`fetchAdvances`-Query): `locationId` aus den Args entfernen, Query-Key entsprechend auf `[periodStart, periodEnd]` reduzieren.

Damit zeigt die Vorschuss-Spalte pro Mitarbeiter die **Gesamtsumme über alle Standorte im Zeitraum**, identisch in jeder Standort-Ansicht — konsistent mit U/K. Der Netto-Lohn (Vorschuss-Abzug) ist dann korrekt, egal welchen Standort man öffnet.

Keine Schema-Änderung, keine Migration, keine Änderung an `payroll_notes`, Tagesabrechnung, Settlements oder UI-Layout.

## Erfolgs-Gate

- `tsc --noEmit` 0
- `eslint src/ --max-warnings=5` 0
- `vitest run` grün
- Manuell: Mitarbeiter mit Vorschüssen an zwei Standorten → in beiden Standort-Ansichten erscheint dieselbe Gesamtsumme; Netto-Lohn = Brutto − Gesamt-Vorschuss.

## Vor dem Commit

`npx prettier --write` über die beiden geänderten Dateien.
