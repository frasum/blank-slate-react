## Ziel
Im Dienstplan-Grid sollen Service-Schichten mit Skill „GL" optisch hervorgehoben werden: amber/gold (#f59e0b) Hintergrund mit weißem Text statt weißem Hintergrund mit dunklem Rahmen. Alle anderen Service-Marker (X, B, 19h, H) bleiben unverändert weiß.

## Änderung
**Eine Datei:** `src/components/roster/ShiftPill.tsx`

Aktuell bekommen alle Service-Pillen `bg = "#ffffff"` und `textCls = "text-foreground border-foreground/40"`.

Neu: Wenn `area === "service"` UND `serviceMarker(shift.skillName) === "GL"`, dann:
- `bg = "#f59e0b"` (amber-500)
- `textCls = "text-white border-transparent"`

Sonst (übrige Service-Marker): wie bisher weiß. Küche: unverändert (skillColor).

## Nicht angefasst
- `service-marker.ts` (Mapping bleibt)
- DB / skills.color
- Küchen-Pillen, Statuslogik, Drag&Drop, Dichte-Klassen

## Erfolgskriterium
GL-Pillen im Service-Tab sind amber mit weißem „GL"-Text; alle anderen Service-Pillen bleiben weiß. `tsc --noEmit` und `eslint --max-warnings=5` grün.