## M-Statistik S-8 — Personalquote (Basis-Brutto-Lohnkosten)

Vierter Bauschritt. Reine, getestete Funktion + dünne Read-Server-Fn. **Keine UI, keine Migration, kein Schema.** Perioden-Modell wie S-7 (`period-window.ts` wiederverwenden).

### Ehrlichkeitsregel

Diese Stufe rechnet **Basis-Brutto-Lohnkosten**: Netto-Stunden × Basis-Stundenlohn (`staff_compensation.hourly_rate`, gültigkeitsdatiert). Bewusst NICHT enthalten (spätere Lohn-Modul-Stufe): Arbeitgeber-SV-Anteil, SFN-Zuschläge, zweiter Satz `hourly_rate_2`. Näherung — nicht die volle Arbeitgeberkostenquote. Steht als Datei-Header-Kommentar in beiden neuen Dateien.

### Datei 1 — `src/lib/statistics/personnel-core.ts` (rein)

Exportierte Typen/Funktionen exakt wie im Auftrag:

- `CompRow = { validFrom: string; hourlyRateEur: number }` (EUR, da `staff_compensation.hourly_rate` numeric in Euro).
- `WorkEntry = { staffId; businessDate; netMinutes }`.
- `selectHourlyRateEur(rows, workDate)`: größtes `validFrom <= workDate`; keiner gültig → `null`. Grenzfall `validFrom == workDate` ist gültig.
- `laborCostCents(netHours, rateEur)`: `Math.round(netHours * rateEur * 100)`.
- `aggregatePersonnel(entries, compByStaff)`:
  - `netHours = entry.netMinutes / 60`.
  - Satz via `selectHourlyRateEur(compByStaff[staffId] ?? [], businessDate)`. Null → Stunden zählen, Kosten 0, `staffId` in `staffWithoutRate` (dedupliziert).
  - Pro Staff summieren (Stunden + Kosten).
  - `totalNetHours = round2(Σ)`, `perStaff` absteigend nach `laborCostCents`.
- `personnelRatioPct(laborCostCents, revenueCents)`: `revenueCents === 0 ? null : (labor / revenue) * 100`.

Tests `personnel-core.test.ts`:
- `selectHourlyRateEur`: mehrere Sätze (richtiger wird gewählt), `validFrom == workDate` gültig, keiner gültig → null.
- `laborCostCents`: 3,5 h × 13,50 € = 4725 ct; Rundung (z. B. 1,333 h × 10 € → 1333).
- `aggregatePersonnel`: zwei Einträge eines Staff summiert; Staff ohne gültigen Satz → in `staffWithoutRate`, Kosten 0, Stunden gezählt; Sortierung nach `laborCostCents` desc.
- `personnelRatioPct`: normal, `revenue 0 → null`.

### Datei 2 — `src/lib/statistics/personnel-stats.functions.ts` (Server-Fn)

`getPersonnelStats`, Muster wie `getTipStats`:

- `inputValidator`: `{ month?: string; startDate?: string; endDate?: string; locationId?: string }` mit gleichen Regex-Checks wie in S-7.
- `requireSupabaseAuth`-Middleware, `loadAdminCaller(..., ["manager","admin","payroll"])`, `org = caller.organizationId`.
- `const { supabaseAdmin } = await import("@/integrations/supabase/client.server")` im Handler.
- Zeitraum-/Vorperioden-Auflösung **identisch zu `getTipStats`** (`monthRange` / `previousMonthRange` / `previousRangeForDates`, Default = `currentMonth()`).
- `loadWindow(win)`:
  - `time_entries` org-scoped, `business_date in [start,end]`, `ended_at not null`. Bei gesetztem `locationId` → `eq('location_id', locationId)` (Einträge ohne Standort fallen damit raus).
  - Pro Eintrag `netMinutes = max(0, grossMinutesBetween(new Date(started_at), new Date(ended_at)) − break_minutes)` → `WorkEntry`.
  - Beteiligte `staff_id` einsammeln. Wenn leer → leeres Aggregat zurückgeben, sonst `staff_compensation` org-scoped für diese laden (`staff_id, valid_from, hourly_rate`) → `compByStaff` (`hourlyRateEur = Number(hourly_rate)`).
  - `aggregatePersonnel(entries, compByStaff)`.
  - Staff-Namen via `staff`-Select für `perStaff` (Pattern wie in `tip-stats.functions.ts`). Fallback Name = `staffId`.
- `cur = loadWindow(current)`; `prev = previousWindow ? loadWindow(previousWindow) : null` (von prev nur Totals).
- Trend: `prev` null → `null`; sonst `{ hours: computeTrend(curMinutesTotal, prevMinutesTotal), cost: computeTrend(curLaborCents, prevLaborCents) }`. Stunden-Trend auf **Netto-Minuten** (ganzzahlig), damit `computeTrend` (ganze Zahlen) sauber arbeitet. Minutensumme intern halten, nicht aus `round2(netHours) * 60` rückrechnen.

Return:

```ts
{
  range: { startDate, endDate, label: string | null },
  totals: { netHours, laborCostCents },
  perStaff: Array<{ staffId, name, netHours, laborCostCents }>,
  staffWithoutRate: string[],
  previous: { netHours, laborCostCents } | null,
  trend: { hours: Trend; cost: Trend } | null,
}
```

`personnelRatioPct` wird hier **nicht** gerechnet — die spätere UI kombiniert `getPersonnelStats` + `getRevenueStats` und ruft `personnelRatioPct(...)` (einzige Quote-Definition). Diese Fn bleibt frei von Umsatz-Fetch; `getRevenueStats` unberührt.

### Wiederverwendung / nicht anfassen

- Wiederverwenden (nur importieren): `period-window.ts` (monthRange/previousMonthRange/previousRangeForDates/currentMonth), `revenue-core.ts` (`computeTrend`), `break-rules.ts` (`grossMinutesBetween`).
- Nicht anfassen: `revenue-*`, `tip-*`, `cash.functions.ts`, `break-rules.ts`-Logik, `staff_compensation`/`time_entries`-Schema, Lohn-Modul. Keine UI, keine Migration.

### Erfolgs-Gate

`tsc --noEmit`, `eslint src/ --max-warnings=5`, `vitest run` grün. Neue `personnel-core.test.ts` grün; bestehende Tests unverändert grün. Kein `any`. Return-Shape wie spezifiziert. Ehrlichkeits-Kommentar (Basis-Brutto, Ausschlüsse: AG-SV, SFN, `hourly_rate_2`) als Header in beiden neuen Dateien. RLS-Inventur unverändert. Vor Commit `prettier --write src/` + `eslint --fix`.
