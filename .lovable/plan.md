## Ziel
Restliche Service-Marker im Dienstplan einfärben:
- `H` (Hausmeister) → grün `#10b981`
- `19h` → violett `#8b5cf6`

`X` bleibt weiß.

## Änderung
**Eine Datei:** `src/components/roster/ShiftPill.tsx` — `serviceColorMap` erweitern:
```
GL: #f59e0b, B: #3b82f6, H: #10b981, "19h": #8b5cf6
```
Weißer Text/transparenter Border greift automatisch.

## Nicht angefasst
service-marker.ts, Küche, sonstiges.