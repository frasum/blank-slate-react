## Ziel
In `src/components/zeit/WeeklyPlan.tsx` (Arbeitszeit-Wochenansicht) zwei rein visuelle Änderungen:

1. **Zebra-Look** für die Mitarbeiter-Zeilen zur besseren Lesbarkeit.
2. **Farbige Zahlen** in den drei Kennzahl-Spalten am rechten Rand:
   - **S** (Schichten) → rot
   - **U** (Urlaub) → grün
   - **K** (Krank) → blau

## Umsetzung

**Zebra**
- Auf `<TableRow>` der Mitarbeiterzeilen (Zeile 452) die Klasse `odd:bg-muted/30` ergänzen. Die Abteilungs-Trennzeilen (`DEPT_BG[grp.dept]`, Zeile 439) bleiben unverändert; die Zebra-Zählung startet innerhalb jeder Abteilungs-Gruppe bei 1, sodass die erste Datenzeile jeweils schattiert ist.
- Die bestehenden Tages-Hintergründe (Sonntag `bg-gray-50`, Feiertag `bg-yellow-50`, außerhalb Periode `bg-muted/40`) bleiben, weil sie an den Tages-`TableCell`s hängen und den Zeilen-Hintergrund überschreiben.

**Farbige S/U/K-Zahlen**
- Zelle **S** (Zeile 640-642): `text-red-600` (bzw. `text-muted-foreground/50` wenn 0 wie bisher bei U/K — für S bisher immer normal; wir zeigen die Zahl bei 0 gedämpft, bei >0 rot).
- Zelle **U** (Zeile 649-653): bei >0 `text-green-600`, sonst weiterhin gedimmt.
- Zelle **K** (Zeile 654-658): bei >0 `text-blue-600`, sonst weiterhin gedimmt.
- Nur die Zahl bekommt Farbe, Alignment/Font unverändert.

## Nicht enthalten
- Keine Änderungen an Kopfzeilen, Spaltenbreiten, Logik oder anderen Ansichten.
- Keine Farb-Änderungen an SF/Ges/20–24/24–x.
- Keine neuen Design-Tokens; die Farben werden direkt als Tailwind-Utility gesetzt, da es sich um eine einzelne interne Admin-Tabelle handelt (analog zum bestehenden `text-amber-600`, `bg-yellow-50` im gleichen File).
