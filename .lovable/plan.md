## Ziel

Die 5 verbleibenden `react-hooks/exhaustive-deps`-Warnungen sauber beheben — ohne Verhaltensänderung, nur Stabilisierung von Memo-/Effect-Dependencies.

## Änderungen

### 1) `src/components/bestellung/CartDrawer.tsx` (Zeile 110)
`const items = cartQ.data?.items ?? [];` → in `useMemo` wrappen:
```ts
const items = useMemo(() => cartQ.data?.items ?? [], [cartQ.data?.items]);
```
Damit bleibt die Referenz stabil, solange die Server-Daten gleich sind → `groups`-Memo (Zeile 125, Dep `items`) wird nicht mehr jedes Render invalidiert.

### 2) `src/routes/_authenticated/admin/bestellung.easyorder.tsx` (Zeile 165)
`const articles = catalogQ.data?.articles ?? [];` → ebenfalls memoizen:
```ts
const articles = useMemo(() => catalogQ.data?.articles ?? [], [catalogQ.data?.articles]);
```
Stabilisiert beide Folge-Memos (`suppliers`, `filtered`).

### 3) `src/routes/_authenticated/admin/zeit-uebersicht.tsx` (Zeile 214)
`const locations = locationsQ.data ?? [];` → memoizen:
```ts
const locations = useMemo(() => locationsQ.data ?? [], [locationsQ.data]);
```
Stabilisiert das große `weeklyExportInput`-Memo (Zeile 559, Dep `locations`).

### 4) `src/routes/_authenticated/admin/bestellung.inventur.tsx` (Zeile 321)
`useEffect(..., [item?.storage_1, item?.storage_2])` → `item` in die Deps aufnehmen:
```ts
}, [item, item?.storage_1, item?.storage_2]);
```
Der Effekt liest `item` direkt — das ist die korrekte Dep-Liste. Verhalten ändert sich nicht, weil sich `item` nur dann ändert, wenn auch die Werte/Identität neu sind.

## Verifikation

- `bun run eslint .` → 0 Errors, 0 der oben genannten Warnings
- `bun run tsc --noEmit` → grün
- `bun run vitest run` → unverändert grün (rein UI-/Hook-Cleanup, keine Logik)

## Nicht im Scope

Keine Verhaltensänderungen, keine sonstigen Refactorings, keine Änderungen an Server-Funktionen oder Datenfluss.