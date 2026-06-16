## Ziel

Den Tab „Zeit" in der Admin-Navigation sowie die zugehörige Seite `/admin/zeit` entfernen. Zeitübersicht, Dienstplan und alle Zeitdaten in der Datenbank bleiben unverändert.

## Änderungen

1. **`src/routes/_authenticated/admin/route.tsx`** — den `<Link to="/admin/zeit">Zeit</Link>`-Block (Zeilen 66–74) löschen. Sonst nichts an der Nav ändern.
2. **`src/routes/_authenticated/admin/zeit.tsx`** — Datei löschen. Der TanStack-Router-Plugin generiert `src/routeTree.gen.ts` automatisch neu, dort ist kein manueller Eingriff nötig.

## Nicht angefasst

- `zeit-uebersicht.tsx` (Tab „Zeitübersicht" bleibt)
- `dienstplan.tsx`
- Keine Migrationen, keine Edge-Functions, keine `time_entries` / `roster_*` Tabellen — alle Zeitdaten in der DB bleiben unberührt.
- Payroll-Redirect (`/admin/zeit-uebersicht`) bleibt unverändert.

## Verifikation

- Build läuft durch (routeTree neu generiert).
- `/admin` zeigt keinen „Zeit"-Tab mehr; „Zeitübersicht" weiterhin sichtbar.
- Aufruf von `/admin/zeit` landet im Not-Found.
