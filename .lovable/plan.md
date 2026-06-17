## Ziel

Im Dienstplan passt der gesamte Monat ohne horizontalen Scrollbalken in die verfügbare Breite. Density „Fit" wird Default.

## Änderungen (nur Frontend)

### 1) `src/hooks/use-density.ts`
- Default-Wert in `read()` von `"normal"` auf `"fit"` ändern (nur wenn nichts gespeichert ist; vorhandene LocalStorage-Werte respektieren).
- Neuer Export `DENSITY_LAYOUT: Record<Density, { staffColPx: number; dayMinPx: number; tableFixed: boolean; horizontalScroll: boolean }>`:
  - `compact`/`normal`/`comfortable`: `{ staffColPx: 180, dayMinPx: 56, tableFixed: false, horizontalScroll: true }` (bisheriges Verhalten).
  - `fit`: `{ staffColPx: 96, dayMinPx: 0, tableFixed: true, horizontalScroll: false }`.
- `DENSITY_PILL_CLASS.fit` weiter verkleinern (`h-5 w-8 text-[9px]`), damit Kürzel auch bei ~36 px Spaltenbreite sichtbar bleiben.

### 2) `src/components/roster/RosterGrid.tsx`
- `DENSITY_LAYOUT` importieren, `const layout = DENSITY_LAYOUT[density]`.
- Card-Wrapper: `overflow-x-auto` nur wenn `layout.horizontalScroll`, sonst `overflow-x-visible`.
- `<table>`: `w-full` + bedingt `table-fixed` (Fit).
- `<colgroup>` ergänzen: eine `<col style={{ width: layout.staffColPx }}>` plus `days.length` × `<col>` (Fit: ohne feste Breite → gleichmäßige Verteilung; sonst `style={{ width: layout.dayMinPx }}`).
- `min-w-[180px]`/`min-w-[56px]`-Klassen aus `<th>`/`<td>` entfernen, durch Style-Bindings aus `layout` ersetzen (im Fit-Modus keine Mindestbreite).
- Tag-Header im Fit-Modus kompakter (kleinere Schrift, Kürzel + Datum eng untereinander); Wochenend-/Heute-Markierungen unverändert.

## Nicht-Ziele
- Keine Änderungen an Daten, Server-Functions, Cash-/Saldo-Code oder anderen Modi.
- Andere Density-Stufen verhalten sich exakt wie heute (inkl. Scrollbalken).

## Erfolgs-Gate
- Erstbesuch (kein LocalStorage): Fit ist aktiv; bei Viewport ≥ 1280 px kein horizontaler Scrollbalken, alle Monatstage sichtbar, Pills lesbar.
- Bestehende Nutzer mit gespeicherter Wahl behalten ihre Einstellung.
- Andere Modi unverändert.
- `tsc --noEmit`, `eslint . --max-warnings=5` grün.
