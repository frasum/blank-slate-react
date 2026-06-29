## M-Statistik S-7 — Trinkgeld-Auswertung + Statistik-Zeitraum auf Kalendermonat

Wiederverwendung der vorhandenen Trinkgeld-Logik (keine neue Formel). Zusätzlich Wechsel des Statistik-Zeitraums auf Kalendermonat — betrifft nur `getRevenueStats` und das neue `getTipStats`. Lohn/Zeit (26.–25.) und die `periods`-Tabelle bleiben unverändert.

### Datei 1 — `src/lib/statistics/period-window.ts` (rein, getestet)

Datums-Helfer aus `revenue-stats.functions.ts` extrahieren (eine Definition, kein Drift):

- `addDays(iso, days)` — UTC-sicher (`new Date(\`${iso}T00:00:00Z\`)`), Rückgabe `YYYY-MM-DD`.
- `daysBetween(startIso, endIso)` — gleicher Tag = 0.
- `previousRangeForDates(startIso, endIso)` — gleich langes Fenster direkt vor `[start,end]`.

Neu — Kalendermonats-Helfer:

- `monthRange(yearMonth)` — `"YYYY-MM"` → `{ startDate: "YYYY-MM-01", endDate: "YYYY-MM-<last>" }`. Monatsletzten UTC-sicher via `new Date(Date.UTC(y, monthIndex + 1, 0)).getUTCDate()`.
- `previousMonthRange(yearMonth)` — `"YYYY-MM"` → `"YYYY-MM"` des Vormonats (Jahreswechsel Jan → Dez Vorjahr).

Tests `period-window.test.ts`: addDays über Monats-/Jahreswechsel, daysBetween gleicher Tag = 0, previousRangeForDates Länge + Anschluss, monthRange für 30-/31-Tage-Monat + Februar (28 und Schaltjahr 29), previousMonthRange inkl. Jahreswechsel.

### Datei 2 — `src/lib/statistics/tip-aggregate.ts` (rein, getestet)

Reine Aggregation, keine DB, keine Trinkgeld-Berechnung. Typen + Funktion exakt wie in der Spezifikation:

- `SessionTipResult` (businessDate, service/kitchenRemainderCents, shares).
- `TipDaily`, `TipTotals`, `TipPerStaff`.
- `aggregateTips(results, staffNames)` → `{ daily, totals, perStaff }`:
  - `daily` pro businessDate summiert (Remainders), aufsteigend.
  - `totals.totalCents = service + kitchen`.
  - `perStaff` summiert über Sessions; `name` aus `staffNames` (Fallback staffId); absteigend nach `tipCents`.

Tests `tip-aggregate.test.ts`: zwei Sessions am selben Tag → eine `daily`-Zeile; Person in mehreren Sessions → ein `perStaff`-Eintrag; Sortierung; `totalCents`-Konsistenz.

### Datei 3 — `src/lib/statistics/tip-stats.functions.ts` (Server-Fn)

Dünne Read-Fn `getTipStats`, Muster wie `getTipRemainderByPeriod`:

- Validator-Shape: `{ month?: string; startDate?: string; endDate?: string; locationId?: string }`. `month` regex `^\d{4}-\d{2}$`, Daten regex `YYYY-MM-DD`, `locationId` UUID.
- `requireSupabaseAuth`-Middleware; `loadAdminCaller(..., ["manager","admin","payroll"])`; `org = caller.organizationId`.
- `const { supabaseAdmin } = await import("@/integrations/supabase/client.server")` im Handler.
- `settings = await loadOrgSettings(org)`.
- Zeitraum-/Vorperioden-Auflösung (siehe Abschnitt unten — identisch zu `getRevenueStats`).
- `loadTipWindow(win)`:
  - `sessions` org-scoped, optional `location_id`, Felder wie `getTipRemainderByPeriod` (`id, business_date, status, locked_at, location_id, tip_pool_settlement_only`); kein Status-Filter (S-6).
  - Pro Session `computeSessionTipPoolCore(caller, session, settings)` aufrufen — keine eigene Rechnung. Ergebnis → `SessionTipResult`; `staffNames` über Sessions mergen.
  - `aggregateTips(results, staffNames)`.
- `cur = loadTipWindow(current)`; `prev = previousWindow ? loadTipWindow(previousWindow) : null` (von prev nur `totals` verwendet, `daily`/`perStaff` der Vorperiode verworfen).
- Trend: `prev` null → `trend = null`; sonst `{ total, service, kitchen }` via `computeTrend`.

Return:

```
{
  range: { startDate, endDate, label: string | null },
  daily: TipDaily[],
  totals: TipTotals,
  perStaff: Array<TipPerStaff & { name: string }>,
  previous: TipTotals | null,
  trend: { total, service, kitchen } | null,
}
```

### Datei 4 — `getRevenueStats` umstellen (Verhalten gleich, Perioden-Modell neu)

`src/lib/statistics/revenue-stats.functions.ts`:

- Lokale Datums-Helfer entfernen → aus `period-window.ts` importieren.
- Validator-Shape neu: `{ month?: string; startDate?: string; endDate?: string; locationId?: string }`.
- `periodId`/`periods`-Tabellen-Lookup vollständig entfernen.
- Zeitraum-/Vorperioden-Auflösung (identisch in beiden Fns):
  - `month` gesetzt → `current = monthRange(month)`, `previous = monthRange(previousMonthRange(month))`, `label = month`.
  - sonst `startDate`+`endDate` Pflicht (mit `endDate ≥ startDate`-Check) → `current = { startDate, endDate }`, `previous = previousRangeForDates(startDate, endDate)`, `label = null`.
  - weder noch → Default auf aktuellen Kalendermonat (UTC-heute → `YYYY-MM`), `label = month`.
- `loadWindow`, Trend, Return-Shape unverändert. Bestehende `revenue-core`/`revenue-map`-Tests bleiben grün (testen reine Funktionen, nicht Perioden-Auflösung).

### Notwendige Exports in `cash.functions.ts`

`computeSessionTipPoolCore` und `loadOrgSettings` mit `export` versehen — nur das Schlüsselwort, keine Signatur-/Logikänderung.

### Nicht anfassen

- `tip-pool.ts`, `waiter-settlement.ts`, `revenue-core.ts`, `revenue-map.ts` — nur importieren.
- Lohn/Zeit-Perioden (26.–25.) und die `periods`-Tabelle — nicht berühren.
- Keine UI, keine Migration, kein Schema, keine Doku-Änderung (S-3-Nachtrag im Gründungsdokument folgt separat).

### Erfolgs-Gate

`tsc --noEmit`, `eslint src/ --max-warnings=5`, `vitest run` grün. Neue Tests (`period-window.test.ts` inkl. monthRange/previousMonthRange, `tip-aggregate.test.ts`) grün. Bestehende Tests (revenue-*, tip-pool, cash) unverändert grün. Beide Statistik-Fns akzeptieren `month`; `periodId` entfernt; Default = aktueller Monat. Kein `any`. Vor Commit `prettier --write src/` + `eslint --fix`. RLS-Inventur unverändert.
