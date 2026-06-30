## Änderungen am Dienstplan-Grid (`src/components/roster/RosterGrid.tsx`)

**1. Überlappende „Leer"-Marker entschärfen**
Die gestrichelten Platzhalter-Buttons in leeren Zellen haben aktuell eine feste Breite (`w-10` = 40 px). In der schmalen `isFit`-Spaltenbreite ragen sie über die Zellgrenzen und überlappen die Nachbarzellen optisch (siehe Screenshot 1).
- Im `EmptyCell.marker`: `w-10` → `w-full max-w-10` und horizontales Padding der Zelle leicht erhöhen, sodass jede dashed Pille sauber innerhalb ihrer Spalte bleibt — auch wenn die Spalte schmaler als 40 px wird.

**2. Rechte Mitarbeiter-Spalte rechtsbündig**
Die neue, rechts klebende Namens-Spalte (Header + Datenzellen) bekommt `text-right` statt `text-left`, damit die Namen direkt an der Σ-Spalte stehen (siehe Screenshot 2).
- Header-`<th>` „Mitarbeiter" (rechts): `text-left` → `text-right`
- Daten-`<td>` mit `{row.displayName}` (rechts): `text-left` → `text-right` (linke Spalte bleibt unverändert linksbündig)

Keine Änderungen an Logik, Sticky-Verhalten, Σ-Berechnung oder Display-Seite.
