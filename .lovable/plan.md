
## Ziel

Die Spalten **S** (Schichten), **U** (Urlaub), **K** (Krank) bekommen in allen drei Ansichten dieselbe Farbgebung wie im Wochenplan bereits etabliert:

- S → rot (`text-red-600`)
- U → grün (`text-green-600`)
- K → blau (`text-blue-600`)

Und zwar sowohl in den **Spaltenüberschriften** (heute überall neutral) als auch in den **Werten** (heute nur im Wochenplan gefärbt).

## Betroffene Stellen

1. **Wochenplan-Header** – `src/components/zeit/WeeklyPlan.tsx` (Zeilen 458–478)
   S/U/K-`<TableHead>` bekommen die passende Textfarbe. Werte-Zellen (rot/grün/blau) bleiben unverändert.

2. **Zusammenfassung** – `src/routes/_authenticated/admin/zeit-uebersicht.tsx` (Zeilen 1284–1288 Header; 1355–1367 Zeilen, 1381–1391 Dept-Summe, 1422–1432 Gesamt)
   - Header S/U/K einfärben.
   - Werte-Zellen (Zeilen, Dept-Summen, Gesamt-Zeile): bei Wert > 0 in der jeweiligen Farbe mit `font-medium`, sonst weiterhin `text-muted-foreground/50` (Analog zum Wochenplan).

3. **Buchhaltung** – `src/components/zeit/PayrollTab.tsx` (Header 174–185; Zeilen 332/339/346; Totals 265/267/270)
   - Header S/U/K einfärben (bleibt `uppercase tracking-wider`, nur Textfarbe wechselt).
   - Werte-Zellen: gleiche Rot/Grün/Blau-Regel wie in der Zusammenfassung.

## Nicht enthalten

- Keine neuen Design-Tokens in `src/styles.css`. Wir bleiben bei den bereits im Wochenplan verwendeten Tailwind-Farben `red-600` / `green-600` / `blue-600`, damit die Farbe 1:1 übereinstimmt und wir keinen zweiten Token-Pfad öffnen.
- Keine Änderung an Werten, Aggregation, Exporten (PDF/XLSX), Sortierung.
- Keine Änderung an Icons, Tooltips, Zeilenhöhen.
- „S"-Bedeutung (Schichtenanzahl) und „SF"-Spalte (Sonntag/Feiertag) bleiben unangetastet.

## Verifikation

- `bunx tsgo --noEmit` grün.
- Sichtprüfung Wochenplan / Zusammenfassung / Buchhaltung: Header S/U/K rot/grün/blau; Werte-Spalten in derselben Farbe (Null/„–" bleibt gedimmt).
