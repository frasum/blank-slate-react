## Ziel
`src/routes/_authenticated/admin/statistik.tsx` um zwei Abschnitte unter dem Umsatzblock ergänzen: **Trinkgeld** und **Personalquote**. Reines Frontend, nutzt vorhandene Server-Fns (`getTipStats`, `getPersonnelStats`) und `personnelRatioPct`.

## Änderungen in `statistik.tsx`

### Imports ergänzen
- `getTipStats` aus `@/lib/statistics/tip-stats.functions`
- `getPersonnelStats` aus `@/lib/statistics/personnel-stats.functions`
- `personnelRatioPct` aus `@/lib/statistics/personnel-core`
- `Badge` aus `@/components/ui/badge`
- `AlertTriangle` (lucide) für staffWithoutRate-Hinweis

### Helper (U1 wiederverwenden, rückwärtskompatibel)
- `fmtEuro`, `fmtSignedEuro`, `TrendLine`, `KpiCard` bleiben bestehen und arbeiten weiter wie heute.
- `KpiCard` bekommt zusätzliche **optionale** Props mit Defaults, damit alle bestehenden U1-Aufrufe (`title`, `cents`, `trend`) unverändert weiterlaufen:
  - `unit?: "eur" | "hours" | "pct"` — Default `"eur"` (heutiges Verhalten).
  - `value?: number` — alternativ zu `cents`, für Stunden/Prozent.
  - `trendRenderer?: (trend) => ReactNode` — überschreibt die Default-`TrendLine` (für Stunden-Trend).
  - Wenn `unit === "eur"`: weiterhin `fmtEuro(cents)` (Aufrufe ohne neue Props bleiben identisch).
  - Wenn `unit === "hours"`: `${value!.toFixed(2)} h`.
  - Wenn `unit === "pct"`: `value === null ? "—" : value.toFixed(1) + " %"`.
- Neue kleine Funktion `TrendLineHours({ trend })`: zeigt Pfeil + `pct` + Delta in Stunden (`(deltaCents/60).toFixed(1)} h`, „deltaCents" ist hier in Wahrheit Minuten — wird **nie als €** gerendert). `pct === null` / `trend === null` → „—".

### Queries (im `StatistikPage`-Body, neben `statsQ`)
```ts
const tipArgs = { month, ...(locationFilter !== "all" ? { locationId: locationFilter } : {}) };
const tipsQ = useQuery({ queryKey: ["stats","tips",month,locationFilter], queryFn: () => getTipStats({ data: tipArgs }), enabled: month.length === 7 });
const personnelQ = useQuery({ queryKey: ["stats","personnel",month,locationFilter], queryFn: () => getPersonnelStats({ data: tipArgs }), enabled: month.length === 7 });
```
Typen via `Awaited<ReturnType<typeof getTipStats>>` / `getPersonnelStats`. Kein `any`.

### Abschnitt „Trinkgeld" (eigene Section unter Umsatz-Chart)
- Eigener Lade-/Fehler-/Leer-Zustand (3 Skeleton-Karten + Listen-Skeleton).
- 3 KPI-Karten (`KpiCard` Default "eur"): Gesamt / Service / Küche mit Trends.
- Card „Trinkgeld pro Mitarbeiter": Liste aus `perStaff` — pro Zeile `Badge` (Service / Küche via Tailwind-Token-Klassen), Name links, `fmtEuro(tipCents)` rechts tabular-nums. Leer → freundlicher Hinweis.

### Abschnitt „Personalquote" (unter Trinkgeld)
- Gemeinsame Ladebedingung: Skeleton, solange `statsQ.data` ODER `personnelQ.data` fehlt.
- Hauptkarte **Personalquote** (`KpiCard unit="pct" value={ratio}`):
  - `ratio = personnelRatioPct(personnelQ.data.totals.laborCostCents, statsQ.data.summary.totalCents)`.
  - Caption (text-xs muted unter Wert): „Basis-Brutto (Netto-Stunden × Stundenlohn) — ohne AG-SV, SFN, Zweitsatz." (über `children`-Slot oder zusätzliche Card-Markup).
- Begleit-KPIs (3 Karten):
  - Netto-Stunden: `KpiCard unit="hours" value={totals.netHours} trendRenderer={() => <TrendLineHours trend={trend?.hours} />}`.
  - Basis-Lohnkosten: `KpiCard` Default eur mit `trend?.cost`.
  - Umsatz/Stunde: `totals.netHours > 0 ? KpiCard eur cents={Math.round(summary.totalCents/totals.netHours)}` ohne Trend, sonst Karte mit „—".
- `staffWithoutRate`-Banner: wenn `length > 0`, eigene Card mit warn-Tailwind-Klassen + `AlertTriangle`:
  „N Mitarbeiter ohne hinterlegten Stundenlohn — Lohnkosten und Quote untertreiben." gefolgt von Komma-Liste der Namen (Mapping `perStaff.find(p=>p.staffId===id)?.name ?? id`).
- Fehler in `personnelQ` → eigener Error-Block; Erfolg ohne Stunden (`totals.netHours === 0`) → Leerzustand „Keine Stunden in diesem Monat."

## Stil / Fallen
- Geld ausschließlich `fmtCents` via `fmtEuro`/`fmtSignedEuro`. Prozent mit `.toFixed(1)`.
- Keine `hsl(var(--…))`-Farben — Tailwind-Tokens / hex wie U1 (`text-emerald-600`, `text-rose-600`).
- Trend-Komponente aus U1 wiederverwendet; `TrendLineHours` neu, nur für Stunden.
- Rückwärtskompatibilität `KpiCard`: alle bestehenden U1-Aufrufe (`title`, `cents`, `trend`) bleiben unverändert; nur neue optionale Props.

## Nicht angefasst
- `src/lib/statistics/*`, Server-Fns, Schema, Migrationen, andere Routen, U1-Umsatzcode.

## Verifikation
- `bunx tsgo --noEmit`, `bunx eslint src/ --max-warnings=5`, `bunx vitest run` grün.
- Prettier `--write` + `eslint --fix` vor Abschluss.
- Manueller Sanity: drei Sections sichtbar; leerer Monat → Leerzustände je Section; Stunden-Trend zeigt „h" / „%", niemals „€"; `staffWithoutRate`-Banner erscheint nur bei fehlenden Sätzen.
