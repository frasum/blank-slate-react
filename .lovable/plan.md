## Ziel
Bar-Schichten (Service-Marker „B") im Dienstplan-Grid blau (#3b82f6) mit weißem Text einfärben — analog zu GL (amber).

## Änderung
**Eine Datei:** `src/components/roster/ShiftPill.tsx`

Service-Marker-Farb-Map einführen:
- `GL` → `#f59e0b`
- `B` → `#3b82f6`
- alle anderen (X, 19h, H) → weiß mit dunklem Text wie bisher

Eingefärbte Marker bekommen `text-white border-transparent`, weiße bleiben `text-foreground border-foreground/40`.

## Nicht angefasst
service-marker.ts, Küche, Drag&Drop, Status-Opacity, Dichte.

## Erfolgskriterium
B-Pillen blau, GL-Pillen amber, restliche Service-Pillen weiß. `tsc --noEmit` grün.