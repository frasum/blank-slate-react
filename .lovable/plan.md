## Ziel

Display `/display/:locationId` füllt einen Bildschirm vollständig — keine horizontale Scroll-Notwendigkeit und kompaktere Zeilen, damit beide Bereiche (Küche + Service) gleichzeitig sichtbar bleiben. Vorbild ist `thaitime` (`useDynamicCellSize` in `QuickScheduleGrid`).

## Befund in COCO

`src/routes/display.$locationId.tsx` rendert pro Bereich eine Tabelle mit:

- linke Sticky-Spalte „Mitarbeiter" (`min-w-[10rem]`)
- 31 Tagesspalten ohne feste Breite (Inhalt bestimmt Breite → ~32–40 px je nach Pillen)
- rechte Sticky-Spalte „Mitarbeiter" (`min-w-[8rem]`, doppelt)
- Σ-Spalte (`min-w-[4rem]`)
- Wrapper `overflow-x-auto`

Rechnung 1280 px: 160 + 128 + 64 + 31 × min ~30 = ~1280 px → schon ohne Reserve am Limit, mit größeren Pillen scrollt es.

Vertikal: `px-3 py-1` pro Zelle plus zwei Header-Zeilen pro Block → bei 20+ Mitarbeitern + zwei Blöcken passt es auf 1080 px nicht mehr ohne Scrollen.

## Plan

Reine UI-Änderungen in `src/routes/display.$locationId.tsx` — keine Daten/Realtime/Pill-Logik anfassen.

### 1. Dynamische Spaltenbreite (Breiten-Fit wie thaitime)

- Pro `BlockTable` einen Wrapper-`<div ref>` mit `useRef<HTMLDivElement>` und einem `ResizeObserver`.
- Konstanten: `LEFT_NAME = 96`, `RIGHT_NAME = 80`, `SUM_COL = 48`, `MIN_CELL = 28`.
- `cellSize = max(MIN_CELL, floor((containerWidth − LEFT_NAME − RIGHT_NAME − SUM_COL) / days.length))`.
- `<table>` bekommt `tableLayout: fixed` plus `<colgroup>` mit festen `width`-Werten (Name, 31 × cellSize, Name, Σ).
- `overflow-x-auto` bleibt als Fallback, scrollt aber im Normalfall nicht mehr.

### 2. Optional zweite Namens-Spalte ausblenden, wenn Platz knapp

Wenn `cellSize === MIN_CELL` und damit die Tabelle trotzdem >100 % wäre, rechte Namens-Spalte (`RIGHT_NAME = 0`) weglassen — sticky-Header/Σ bleiben. Steuerung über das gleiche Resize-Hook-Ergebnis (`showRightName: boolean`), passend zu beiden `<thead>` und `<tbody>`.

### 3. Vertikale Kompaktheit

- Zellen-Padding `px-3 py-1` → `px-2 py-0.5`.
- Header `px-3 py-2` → `px-2 py-1`, Zeile mit Wochentag/Datum/Schichtzahl bleibt drei-zeilig, aber `text-[10px]`/`leading-tight` durchziehen.
- Pille `h-5 w-8` bleibt; nur Zellen-Padding schrumpft.
- Sektion `space-y-8 p-6` → `space-y-4 p-3` und Block-Header `py-3` → `py-2`.

### 4. Header/Footer flexibler

Header `py-6` → `py-3`, Geburtstags-Banner `py-5` → `py-3`. Schriftgrößen leicht reduzieren (`text-4xl` → `text-2xl`, `text-3xl` → `text-xl`), damit oben weniger Höhe verloren geht.

## Technisches Detail

```text
useDynamicCellSize(containerRef, daysCount):
  on mount + resize:
    w = containerRef.clientWidth
    cellSize = max(MIN_CELL, floor((w − LEFT − RIGHT − SUM) / daysCount))
    showRightName = (LEFT + RIGHT + SUM + cellSize * daysCount) <= w
  return { cellSize, showRightName }
```

Hook neu unter `src/lib/display/use-fit-cell-size.ts` (rein clientseitig, SSR-safe via `useEffect`).

## Gates

```bash
bunx tsgo --noEmit
bunx vitest run
npx prettier --check .
```

Keine neuen Tests nötig (rein presentational); manueller Sicht-Check im Preview auf 1280 × 800 und 1920 × 1080.
