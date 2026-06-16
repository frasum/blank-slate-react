## Ziel
Die Geburtstags-Markierung im Dienstplan (`/admin/dienstplan`) soll auf einen Blick erkennbar sein: die komplette Tageszelle des Geburtstags-Kindes wird rosa eingefärbt, mit einem größeren, zentrierten Kuchen-Icon — analog zum Urlaub/Krank-Pattern (`HeartPulse`/`Umbrella`).

## Verhalten
- **Leere Zelle am Geburtstag**: rosa Hintergrund füllt die Zelle, Kuchen-Icon (h-5 w-5) zentriert. Klick öffnet weiterhin den normalen Quick-Popover (Schicht anlegen, Urlaub etc.).
- **Zelle mit Schicht am Geburtstag**: Schicht-Pille bleibt voll lesbar; rosa Hintergrund liegt dezent dahinter; kleines Kuchen-Icon in der oberen rechten Ecke (wie aktuell).
- **Wochenend-/Today-Färbung** wird vom rosa Hintergrund überlagert (Geburtstag gewinnt visuell).
- **Tooltip**: „Geburtstag: {Name}" beim Hover über das Icon (unverändert).

## Technische Details (nicht-technisch lesbar)
**Datei**: `src/components/roster/RosterGrid.tsx` — nur `DropCell`.

1. Neuen Render-Zweig `showBirthdayFull = birthday && !hasShift && !absent && !showUnavailableBox` hinzufügen — rendert einen `absolute inset-0`-Overlay mit rosa Hintergrund (`bg-pink-500/15` o. ä., konsistent mit bestehenden Tailwind-Tokens) und zentriertem `<Cake className="h-5 w-5 text-pink-600" />`.
2. Bestehenden Eck-Marker (`birthday ? ... : null`) so anpassen, dass er nur bei `hasShift` angezeigt wird (sonst doppelt mit Vollbild-Variante).
3. Reihenfolge der Overlays beachten: Unavailable < Birthday-Full < Absence-Full < Children (Pille) < Absence-Corner / Birthday-Corner / Unavailable-Corner. So bleibt Urlaub/Krank weiter dominant, falls beides am selben Tag zusammenträfe (sehr selten).

**Keine** Änderungen an:
- `src/lib/roster/roster.functions.ts` (DOB wird bereits geladen)
- `getStaffForRoster`-Signatur / Server-Logik
- Empty-Cell-Click-Verhalten (Popover bleibt erreichbar — das rosa Overlay ist `pointer-events-none`)

## Gate
- `npx tsc --noEmit` 0 Fehler
- Preview-Check: An einem bekannten Geburtstag (z. B. heute, 17. Juni) ist die Zelle des/der Mitarbeiter:in im Dienstplan rosa mit Kuchen-Icon; Schicht-Pille bleibt sichtbar wenn vorhanden.
