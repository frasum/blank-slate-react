# Doku-Nachzug §10 — Zeit-Re-Import + location_id-Reparatur

Reine Dokumentations-Änderung an `docs/arbeitsweise.md`. Keine Code-, Schema- oder Migrations-Anpassung.

## Änderungen

1. **Stand-Zeile (Zeile 5)** ersetzen:
   - alt: `Stand: 24.06.2026`
   - neu: `Stand: 26.06.2026`

2. **Neuer Abschnitt §10** ans Dateiende anhängen (nach §9), Inhalt wortgleich zum Prompt:
   - Einleitung: Re-Import März–Juni 2026 aus Legacy-`tagesabrechnung` über `/admin/migration`, ersetzt periodenweise; danach location_id-Reparatur.
   - Ergebnis-Tabelle mit den vier Perioden (Zeilen / Std COCO / Std Quelle), Wasserlinien-Hinweis.
   - Verbindliche Prozedur pro Periode (6 Schritte: Export+Sanity, Dry-Run, gescopter DELETE, Commit erst bei Rest=0, Endcheck, Stunden-Abgleich).
   - Lektionen: „Success. No rows returned" sagt nichts; Importer setzt keine `location_id`; Backfill-Mechanik (34 Single-Location-MA via min(location_id::text)::uuid; 8 Mehrhaus-Fälle via `zt_shifts.week_id → weeks.period_id → scheduling_periods.restaurant_id`).
   - Offen: Importer dauerhaft fixen, damit `location_id` direkt gesetzt wird.

## Vor Commit

- `npx prettier --write docs/arbeitsweise.md`
- Sicherstellen: abschließender Zeilenumbruch am Dateiende.

## Nicht angefasst

Keine andere Datei. §1–§9 inhaltlich unverändert (außer Stand-Zeile).
