## Zebra-Streifen für RosterGrid (Dienstplan)

Ziel: Jede zweite Mitarbeiterzeile bekommt einen leicht abgesetzten Hintergrund — gleicher Farbton wie die Wochenend-Spalten (`bg-muted-foreground/25` aus dem Header bzw. abgeschwächt `bg-muted/30`/`bg-muted/40` für ungerade Zeilen), damit das Auge horizontal besser folgen kann.

### Änderungen — nur `src/components/roster/RosterGrid.tsx`

1. Im `<tbody>`-Map über `visibleStaff`: `<tr>` bekommt zusätzlich `even:bg-muted/40` (Zebra-Streifen in Wochenend-Grau-Ton, gedämpft).
2. Die sticky linke + rechte Namens-Spalte sowie die sticky Σ-Spalte nutzen aktuell `bg-background` / `bg-muted`. Damit sie beim Zebra mitziehen, werden sie ebenfalls über `group/row` + `group-even/row:bg-muted/40` gestreift — Variante: `tr` erhält `group/row even:bg-muted/40`, die sticky-`td`s erhalten `bg-background group-even/row:bg-muted/40` (bzw. die Σ-Spalte `bg-muted group-even/row:bg-muted/60`), damit der sticky-Hintergrund deckend bleibt und nicht durchscheint.
3. Wochenend-Spalten und Heute-Highlight bleiben unverändert (höhere Priorität via konkretere Klassen — Wochenende: `bg-muted-foreground/25`, Heute: `bg-yellow-200/70`).
4. Hover-Effekt (`hover:bg-muted/30`) bleibt; Zebra wirkt nur im Ruhezustand.

### Nicht angefasst
Display-Route (`display.$locationId.tsx`) — dort sind die Zeilen schon kontrastreich auf dunklem Grund; Zebra nur im Admin-Grid wie auf dem Screenshot gewünscht. Daten-, Sticky-, Drag- oder Paint-Logik bleibt unberührt.

### Erfolgs-Gate
- visuell: jede zweite Zeile leicht grau; Wochenend-Spalten weiterhin dunkler; Heute-Spalte gelb dominiert; sticky-Spalten links/rechts/Σ ohne Durchscheinen.
- `bun run tsc --noEmit` grün, kein Eslint-Drift.
