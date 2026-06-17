## Ursache

`filter: saturate() brightness()` auf der gesamten Pille wirkt auch auf den Text — deshalb erscheint das weiße Label bei den Küchen-Pillen gräulich, bei den Service-Pillen aber sauber weiß.

## Änderung

**`src/components/roster/ShiftPill.tsx`**

1. `filter` komplett entfernen.
2. Hintergrundfarbe direkt deepen via `color-mix(in oklab, ${bg} X%, black)` — nur die Fläche wird kräftiger, Text bleibt reines Weiß.
   - confirmed: ~60 % Skillfarbe + 40 % Schwarz
   - planned:  ~70 % Skillfarbe + 30 % Schwarz
3. Opacity bleibt 1 (außer beim Draggen 0.4).

## Erfolgskriterium

Küchen- und Service-Pillen zeigen denselben Weißton im Label; Hintergrund bleibt kräftig.
