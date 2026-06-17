## Ziel
Tageszahl im Spaltenkopf einfärben:
- `< 5` → rot
- `= 5` → wie bisher (foreground bzw. muted)
- `> 5` → grün

Gilt sowohl im Küchen- als auch im Service-Tab und für beide Standorte (eine einzige Render-Stelle deckt beides ab).

## Änderung
**Eine Datei:** `src/components/roster/RosterGrid.tsx` — Klasse für `<span>` mit `cnt` so erweitern:
- `cnt === 0` → bleibt `text-muted-foreground/40` (kein „rot" für leere Tage, sonst flattern alle Wochenenden)
- `cnt > 0 && cnt < 5` → `text-red-600`
- `cnt === 5` → `text-foreground` (Status quo)
- `cnt > 5` → `text-green-600`

## Nicht angefasst
Datenfluss, Gesamtsumme, Farben der Pillen, Layout.

## Erfolgskriterium
Counts unter den Datumsangaben sind rot/grün/normal nach Regel; `tsc --noEmit` grün.

## Frage offen
„Cnt 0 = rot oder neutral?" — ich gehe per Default von neutral aus (sonst sind alle freien Tage permanent rot). Bitte korrigieren, falls 0 doch rot sein soll.