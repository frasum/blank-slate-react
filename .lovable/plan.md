## Änderung

**`src/components/roster/ShiftPill.tsx`** — feste Farb-Map für Küchen-Pillen analog zur Service-Map:

```ts
const kitchenColorMap: Record<string, string> = {
  VS: "#3b82f6",      // Blau
  PA: "#ef4444",      // Rot   (Abkürzung von PASS)
  SP: "#10b981",      // Grün  (Abkürzung von SPÜLEN)
  CO: "#f59e0b",      // Orange
};
```

Logik:
- Für Küchen-Pillen statt `shift.skillColor` zuerst `kitchenColorMap[label]` verwenden; Fallback auf `shift.skillColor`, dann grau.
- `color-mix`-Abdunkeln bleibt (confirmed 60 %, planned 70 %).
- Text bleibt weiß.

## Nicht angefasst

DB-Skillfarben, Service-Map, Layout, Logik.

## Erfolgskriterium

VS=blau, PASS=rot, SPÜLEN=grün, CO=orange — kräftig, mit gleichem Weiß im Label wie Service.
