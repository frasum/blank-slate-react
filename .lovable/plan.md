## Wochenplan-Tab auf Abrechnungsperioden (26.–25.) umstellen

Eine Datei: `src/routes/_authenticated/admin/zeit-uebersicht.tsx`. Keine Migration, keine Server-Function-, keine Schema-Änderung. Hängt sich an das bereits vorhandene `selectedPeriodId` / `effectivePeriodId` / `selectedPeriod` (gemeinsam mit den anderen Tabs).

### Änderungen

1. **`periodWeeks` statt `monthWeeks`** (neues `useMemo`, abhängig von `selectedPeriod`): Wochen-Chips vom Montag des `startDate` bis zur Woche, deren Montag noch `<= endDate` liegt. Chip-Render `monthWeeks.map(...)` → `periodWeeks.map(...)`; Darstellung (W{idx} + `(ddmm–ddmm)`, aktiv wenn `c.start === weekStart`) unverändert.

2. **Wochenplan-Header-Dropdown: Monat → Periode.** `<select value={selectedMonth}>` mit `monthOptions` ersetzen durch ein Perioden-Dropdown an `effectivePeriodId`. `onChange` setzt `setSelectedPeriodId(id)` und schnappt `weekStart` auf `mondayOf(parseIsoDate(p.startDate))`. Optionslabel: `{p.label} ({ddmm(start)}–{ddmm(end)}){locked ? " 🔒" : ""}`.

3. **Sync-Effekt** (neuer `useEffect`, Deps **nur** `[effectivePeriodId]` mit `// eslint-disable-next-line react-hooks/exhaustive-deps` direkt über dem Dep-Array): liegt `weekStart` außerhalb `[firstMonday(period), endDate]`, snap auf die Woche mit „heute", sonst auf `firstMonday`. Guard macht ihn idempotent. Falls `useEffect` noch nicht aus `react` importiert: ergänzen.

4. **„Heute"-Button** zusätzlich: Periode, die heute enthält, suchen und `setSelectedPeriodId(containing.id)` aufrufen; danach wie bisher `weekStart` auf Montag von heute setzen.

5. **Toten Code entfernen:** `selectedMonth`/`setSelectedMonth`, `monthOptions`, `monthWeeks`. **`MONTH_DE` bleibt** (von `periodLabelForEnd` genutzt).

### Bewusst nicht anfassen

Bestehendes Perioden-Select der anderen Tabs, `fromDate`/`toDate`, alle Queries, `weekStart`-Mechanik, Grid (`WeeklyPlan`), Location-Pills, Exports, alle Server-Functions.

### Gate

`prettier --write` + `eslint --fix` auf der Datei. `tsc --noEmit`, `eslint . --max-warnings=5`, `prettier --check .`, `vitest run` (738) grün. Keine neue `react-hooks/exhaustive-deps`-Warning (Gate bereits voll).

### E2E

- Dropdown im Wochenplan zeigt Perioden („Juni 2026 (26.05.–25.06.)").
- Periodenwechsel → Chips spannen 26.–25., angezeigte Woche bleibt in der Periode, Grid lädt.
- „Heute" springt auf Periode + Woche von heute.
- Periodenwechsel in z. B. Buchhaltung zieht Wochenplan mit (gemeinsamer State).
