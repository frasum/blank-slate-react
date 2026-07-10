## STAT-U3 — Standortvergleich-Tab

Neuer Tab „Standortvergleich" auf `/admin/statistik`, gespeist ausschließlich aus bestehenden COCO-Bausteinen (kein Neubau von Umsatz-/Trinkgeld-Formeln, keine Migrationen, keine neuen Deps).

### 1) Reine Vergleichs-Helfer + Tests
**Neu:** `src/lib/statistics/comparison-core.ts` mit
- `pctDiff(a, b)` — relative Abweichung von `a` ggü. `b` (mit Vorzeichen); `b === 0` → `null`.
- `shareOf(a, b)` — Anteil `a/(a+b)` als 0..1; `a+b === 0` → `0.5` (neutrale Aufteilung).
- Optional: `pickTopTwoByTotal(rows)` — deterministische Auswahl der zwei umsatzstärksten Standorte (bei Gleichstand nach Name).

**Neu:** `src/lib/statistics/comparison-core.test.ts` (Vorzeichen, 0-Randfälle, Rundung, Top-2-Auswahl inkl. Gleichstand).

### 2) Server-Fn `getLocationComparison`
**Neu:** `src/lib/statistics/comparison-stats.functions.ts` (Muster wie `getRevenueStats`/`getTipStats`):
- Input: `{ month? | startDate?+endDate? }` — **kein** `locationId` (immer alle aktiven Standorte der Org).
- Caller-/Rollen-Behandlung identisch (`loadAdminCaller` → `manager|admin|payroll`).
- Umsatz je Standort: **ein** Read über `sessions` + `session_channel_amounts` + `waiter_settlements` für den Zeitraum ohne `location_id`-Filter, dann per `location_id` gruppiert und je Gruppe durch `aggregateByBusinessDate` + `summarize` (bestehende Bausteine aus `revenue-core.ts`) — liefert `totalCents`, `takeawayCents`, `daysWithData`.
  - `avgDailyCents = totalCents / daysWithData` (0 bei `daysWithData === 0`).
- Trinkgeld je Standort: `computeSessionTipPoolCore` je Session (Kernpfad aus `tip-stats.functions.ts` wiederverwenden), Ergebnisse per `location_id` gruppiert durch `aggregateTips` → `serviceCents`/`kitchenCents`.
  - `avgTipPerDayCents = (service+kitchen) / daysWithData`.
- Return-Shape:
  ```ts
  {
    range: { startDate, endDate, label },
    overall: { totalCents, avgDailyCents, tipTotalCents, daysWithData },
    perLocation: Array<{
      locationId, name,
      totalCents, avgDailyCents, takeawayCents,
      kitchenTipCents, serviceTipCents, avgTipPerDayCents,
      daysWithData
    }>
  }
  ```
- **KGL:** keine Formel-Duplikate — nur Gruppierung um die bestehenden Bausteine. Falls nötig, minimale optionale Gruppierungs-Helfer in `revenue-core.ts`/`tip-aggregate.ts` ergänzen (additiv, bestehende Aufrufer bleiben grün).

### 3) UI-Tab in `statistik.tsx`
- Vierter `TabsTrigger` „Standortvergleich" neben Umsatz/Trinkgeld/Personal; nutzt dieselbe Zeitraum-Auswahl.
- Query auf `getLocationComparison` (analog zu den bestehenden Stats-Queries).
- **Kopfkarte „Gesamt (alle Standorte)":** Gesamtumsatz · Ø Tagesumsatz · Trinkgeld gesamt (via `fmtCents`).
- **Standortauswahl:** Wenn > 2 Standorte mit Daten, schlichter Pills-Umschalter A/B (Default: die zwei umsatzstärksten). Bei genau 1 Standort: Hinweistext statt Vergleichskarten. Bei 0: Leerzustand.
- **Sechs Vergleichskarten** (eine wiederverwendbare Komponente `ComparisonCard` lokal im File):
  Gesamtumsatz · Ø Tagesumsatz · Küchen-Trinkgeld · Service-Trinkgeld · Lieferumsatz (`takeawayCents`) · Ø Trinkgeld/Tag.
  Layout je Karte: links A (Betrag + `pctDiff`-Badge grün/rot), „VS", rechts B spiegelbildlich; darunter zweifarbiger Anteilsbalken (`shareOf`) in stabilen Standortfarben (Zuordnung nach `locationId`-Reihenfolge, konsistent über alle Karten).
- **Fußkarte „Tage mit Daten"** je Standort.
- Keine hartkodierten Standortnamen — alles aus `locations`/Response.

### Nicht angefasst
- Umsatz-/Trinkgeld-/Personal-Tab-Inhalte, `tip-stats`/`revenue-stats`/`personnel-stats`.
- Migrationen, RLS, Deps.

### Technische Details
- Farbwahl: zwei Tokens aus dem bestehenden Chart-Farbraum wiederverwenden (kein neuer Design-Token). Zuordnung stabil per sortierter `locationId`.
- Vor Commit: `npx prettier --write .` + `npx eslint --fix` auf geänderten Dateien.
- Gates: `bun run tsc --noEmit` · `npx eslint .` · `npx prettier --check .` · `npx vitest run` (1641 + neue comparison-Tests).
