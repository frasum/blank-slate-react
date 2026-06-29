## Ziel
`src/routes/_authenticated/admin/statistik.tsx` um Abschnitt **Standort-Vergleich** unter den bestehenden Blöcken erweitern. Reines Frontend, nur Konsum bestehender Server-Fns. Vergleich ignoriert den oberen Pill-Filter.

## Änderungen in `statistik.tsx`

### Imports ergänzen
- `useQueries` aus `@tanstack/react-query`.
- Vorhandene `getRevenueStats`, `getTipStats`, `getPersonnelStats`, `personnelRatioPct` bleiben.
- `Table`-Primitive aus `@/components/ui/table` nutzen, wenn vorhanden — sonst schlichte `<table>`-Struktur mit Tailwind. Vor dem Bauen einmal `src/components/ui/table.tsx` prüfen.

### Multi-Standort-Queries — drei homogene `useQueries`
Vorbild: `allLocationQueries` in `zeit-uebersicht.tsx`. Drei getrennte, homogen typisierte Arrays — kein `flatMap`, kein Union-Typ, kein Cast.

```ts
const revQueries = useQueries({
  queries: locations.map((loc) => ({
    queryKey: ["stats","cmp","rev", loc.id, month],
    queryFn: () => getRevenueStats({ data: { month, locationId: loc.id } }),
    enabled: month.length === 7,
  })),
});
const tipQueries = useQueries({ queries: locations.map((loc) => ({ … getTipStats … })) });
const perQueries = useQueries({ queries: locations.map((loc) => ({ … getPersonnelStats … })) });
```

- Pro Standort `i` zippen: `revQueries[i]`, `tipQueries[i]`, `perQueries[i]`. Jeder Array-Eintrag ist bereits korrekt typisiert (`UseQueryResult<Awaited<ReturnType<…>>>`).
- Aggregat:
  - `isLoading` = irgendeine der drei Arrays enthält ein `q.isLoading === true`.
  - `firstError` = erste Query mit `isError` → Fehlerbanner mit deren Message.
- `enabled` greift; bei `locations.length === 0` sind alle Arrays leer.

### Neue Komponente `LocationCompareSection`
- Eigene Section unter `PersonnelSection`.
- Props: `month: string`, `locations: Location[]` (Typ via `Awaited<ReturnType<typeof listLocations>>[number]`).
- Card mit Titel „Standort-Vergleich" und Caption „Alle Standorte, unabhängig vom Filter oben."
- Zustände: Loading (Skeleton-Tabelle), Error (`ErrorState`), Empty (`locations.length === 0`) — sonst Tabelle.

### Tabelle
- Spalten: Standort | Umsatz | Trinkgeld | Personalquote | Netto-Std. | Basis-Lohnkosten.
- Numerische Spalten rechtsbündig, `tabular-nums`. Wrapper `overflow-x-auto` für schmale Viewports.
- Zellen pro Index `i`:
  - `rev = revQueries[i].data`, `tip = tipQueries[i].data`, `per = perQueries[i].data` (alle definiert, da Section sonst noch lädt).
  - Umsatz → `fmtEuro(rev.summary.totalCents)`.
  - Trinkgeld → `fmtEuro(tip.totals.totalCents)`.
  - Personalquote → `personnelRatioPct(per.totals.laborCostCents, rev.summary.totalCents)`; `null` → „—"; sonst `value.toFixed(1) + " %"`.
  - Netto-Std. → `per.totals.netHours.toFixed(2)`.
  - Basis-Lohnkosten → `fmtEuro(per.totals.laborCostCents)`.
- `staffWithoutRate`-Marker: bei `per.staffWithoutRate.length > 0` kleines ⚠ (lucide `AlertTriangle`, `h-3.5 w-3.5 text-amber-600`) neben Personalquote-Zelle, natives `title=…` „N ohne Stundenlohn — Quote untertreibt". Kein Popover, kein Banner.
- Standorte in Reihenfolge `locationsQ.data` (entspricht Pills).
- Keine Summenzeile (bewusst weggelassen).

### Integration in `StatistikPage`
- Nach `<PersonnelSection …/>` einfügen:
  `<LocationCompareSection month={month} locations={locations} />`.

## Stil / Fallen
- Geld nur über `fmtEuro` (→ `fmtCents`). Prozent `toFixed(1)`. Stunden `toFixed(2)`.
- Keine `hsl(var(--…))` — Tailwind-Tokens / Hex.
- `tabular-nums` für alle Zahlenspalten.
- `locationFilter` (Pill-Filter) wird **nicht** in die Compare-Queries gereicht.
- Kein `any`, keine Casts — Homogenität der drei Arrays sichert die Typen.

## Nicht angefasst
- `src/lib/statistics/*`, Server-Fns, Schema, Migrationen, andere Routen.
- Obere U1-/U2-Blöcke und Standort-Pill-Filter bleiben unverändert.

## Verifikation
- `bunx tsgo --noEmit`, `bunx eslint src/ --max-warnings=5`, `bunx vitest run` grün.
- Prettier `--write` + `eslint --fix` vor Abschluss.
- Manueller Sanity: Vergleich zeigt alle Standorte; Monatswechsel aktualisiert; ⚠ nur bei fehlenden Sätzen; leerer Monat → „—" / `0,00 €`; oberer Pill-Filter ändert Compare-Zeilen nicht.
