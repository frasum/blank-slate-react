## Ziel
In der Trinkgeldpool-Karte (Kasse) die „Stunden"-Spalte im Zeitformat `h:mm` statt als Dezimalzahl (`7,80`) anzeigen — konsistent mit den GL- und Manuell-Einträgen, die bereits `h:mm` nutzen.

## Betroffener Ort
`src/components/cash/TipPoolCard.tsx`, Funktion `PoolRow` (~Zeilen 616–628). Alle drei Zweige der `hoursDisplay`-Berechnung liefern derzeit `X,YZ` via `toFixed(2).replace(".", ",")`.

Andere Stunden-Anzeigen in derselben Karte (GL-Zeile, Dialog „Manuelle Einträge") sind bereits `h:mm` — kein Änderungsbedarf.

## Änderung
```text
hoursDisplay =
  · dirty & Zeiten gesetzt → kitchenShiftMinutes(start,end) → "h:mm"
  · share vorhanden       → round(share.hoursWorked * 60)   → "h:mm"
  · fallback              → row.hoursMinutes                → "h:mm"
"ungültig" bleibt bei Wurf.
```
Formatter analog zum bestehenden `fmtHm` (bzw. inline wie in `GlRowInner`): `${Math.floor(m/60)}:${(m%60).toString().padStart(2,"0")}`.

## Gates
tsgo, vitest, eslint, prettier — keine neuen Tests nötig (reine Formatierung, keine Rechenlogik).

## Nicht Teil dieses Schritts
- Andere Stunden-Spalten (Lohnrechner, Provision, Zusammenfassung, Buchhaltung) — dort steht schon `fmtHm`/`h:mm`.
- Kein Umbau der Berechnung; `share.hoursWorked` bleibt der Wahrheits-Wert, nur die Darstellung ändert sich.