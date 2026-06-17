## Ziel
Den `Darstellung`-Umschalter (Kompakt/Normal/Komfort/Fit) komplett entfernen. „Fit" wird fix verdrahtet — kein Hook, kein LocalStorage, kein Toggle, keine anderen Modi.

## Änderungen

### 1. `src/components/roster/DensityToggle.tsx` — **löschen**

### 2. `src/hooks/use-density.ts` — **löschen**

### 3. `src/routes/_authenticated/admin/dienstplan.tsx`
- Imports `useDensity`, `DensityToggle` raus
- `const [density, setDensity] = useDensity()` raus
- `<DensityToggle …/>` aus dem Header entfernen (samt umgebendem Label „Darstellung", falls vorhanden)
- `density={density}` an `<RosterGrid>` entfernen

### 4. `src/components/roster/RosterGrid.tsx`
- `density`-Prop entfernen
- Imports auf konstante Werte umstellen: `rowH = 28` (Fit-Höhe), `layout = { staffColPx: 96, dayMinPx: 0, tableFixed: true, horizontalScroll: false }`, `isFit = true`
- An `<ShiftPill>`: `density="fit"` fest

### 5. `src/components/roster/ShiftPill.tsx`
- Statt Import aus `use-density` eine lokale Konstante: `const FIT_PILL_CLASS = "h-5 w-8 text-[9px]"`
- `density`-Prop entfernen, Klasse fest verwenden

## Nicht angefasst
Farben/Pillen-Logik, Drag&Drop, Datenfluss, Cash/Saldo.

## Erfolgskriterium
Header zeigt kein „Darstellung" mehr; Grid rendert identisch zum bisherigen Fit-Modus. `tsc --noEmit` und `eslint --max-warnings=5` grün.