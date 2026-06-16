## Ziel

Die Startseite (`/`, authentifiziert) bekommt direkten Zugriff auf die wichtigsten Arbeitsbereiche, statt erst über „Zur Verwaltung" zu navigieren.

## Änderung

Genau eine Datei: `src/routes/_authenticated/index.tsx`.

Neue Button-Reihenfolge:

1. **Zeiterfassung** → `/zeit` (primär, bleibt)
2. **Abrechnung** (persönliche Lohnabrechnung) → `/zeit/abrechnung` (bleibt)
3. **Dienstplan** → `/admin/dienstplan` *(nur admin/manager)*
4. **Tagesabrechnung** → `/admin/kasse` *(nur admin/manager)*
5. **Bestellungen** → `/admin/bestellung` *(nur admin/manager)*
6. **Zur Verwaltung** → `/admin` *(nur admin/manager, als sekundärer Link)*

Alle Buttons nutzen die bestehenden Styles (primary für Zeiterfassung, outline/card für den Rest). Die Admin-Buttons werden wie bisher hinter `canAdmin` (`role === "admin" | "manager"`) gegated; für normale Mitarbeiter bleibt die Seite unverändert schlank (Zeiterfassung + Abrechnung).

„Zur Verwaltung" bleibt erhalten, damit Admins weiterhin in den vollen Index (`/admin`) mit allen restlichen Bereichen wie Mitarbeiter, Lieferanten, Einstellungen, Locations, Trinkgeld-Rest etc. kommen.

## Nicht im Scope

- Keine neuen Routen, keine Logikänderungen.
- Keine Änderungen an `/admin` selbst oder der Admin-Navigation.
- Kein Umbau des Hydration-Mismatch-Warnings im Auth-Layout (separates Thema).

## Erfolgs-Gate

- `npx tsc --noEmit` → 0 Fehler
- `npx eslint . --max-warnings=5` → 0 Fehler
- Manuell: Als admin erscheinen 6 Buttons in obiger Reihenfolge; als normaler Staff nur Zeiterfassung + Abrechnung.
