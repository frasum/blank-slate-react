## Ziel

Beide Abgleichs-Warnungen sind False Positives. Zwei Bugs fixen:
1. POS-Diff zieht fälschlich `delivery_wolt` ab — Wolt ist Drittplattform, nie im Vectron-Umsatz.
2. Terminal-Diff zählt „Kredit Karten GL" zu physischen Terminals, statt zur Kellner-Karten-Seite.

Voraussetzung erfüllt: `payment_terminals.is_gl` existiert per SQL, GL-Terminal markiert.

## Änderungen

### 1. `src/lib/cash/settlement-warnings.ts`
- `deliveryWoltCents` aus `SettlementWarningInput` entfernen. POS-Delivery = `deliveryVectronCents + deliverySouseCents`. Kommentar dokumentiert Wolt-Begründung (Legacy `adjustedPosDiff` zieht `wolt_revenue` nie ab).
- Neues Pflichtfeld `glCardCents: number` (int, validiert wie die anderen Cent-Felder).
- Semantik `terminalsTotalCents` ändert sich: nur physische Terminals, ohne GL.
- Terminal-Formel: `terminalDiff = terminalsTotalCents − (waiterCardTotalCents + glCardCents)`.
- Warnungs-Union erweitern:
  ```ts
  | { kind: "terminal_diff"; terminalsCents: number; waiterCardCents: number; glCardCents: number; diffCents: number }
  ```

### 2. `src/lib/cash/settlement-warnings.test.ts`
Reale Spicery-Zahlen (10.06.2026) als Regressions-Guards:
- POS ohne Wolt-Input: `posTotal=607740`, Kellner-POS `[152140,177120,185150]`, `deliveryVectron=79790`, `deliverySouse=13540` → keine POS-Warnung.
- Terminal mit GL auf Kellner-Seite: `terminalsTotal=425062`, Kellner-Karte `[160254,177142,86076]`, `glCardCents=1590` → keine Terminal-Warnung.
- Gegenprobe: gleiche Zahlen mit `glCardCents=0` → Terminal-Warnung mit `diffCents=1590`.

Bestehende Tests an neue Input-Shape anpassen (Wolt-Feld raus, `glCardCents:0` ergänzen).

### 3. `src/lib/cash/cash.functions.ts` — `listPaymentTerminals`
- Select um `is_gl` erweitern.
- Mapping `isGl: r.is_gl` ins Result-Objekt. TS-Row-Typ entsprechend ziehen.
- Aggregate (Wolt-Buchungen u. Ä.) bleiben unverändert.

### 4. `src/routes/_authenticated/admin/kasse.tsx` — `SettlementWarningsBanner`
- Prop `terminals={terminalsQ.data ?? []}` hinzu.
- Im Banner Lookup `terminalById = Object.fromEntries(terminals.map(t => [t.id, t]))`.
- `overview.terminalAmounts` aufsplitten:
  ```ts
  let physicalTerminalCents = 0, glCardCents = 0;
  for (const t of overview.terminalAmounts ?? []) {
    if (terminalById[t.terminalId]?.isGl) glCardCents += Number(t.amountCents);
    else physicalTerminalCents += Number(t.amountCents);
  }
  ```
- `aggregateChannelAmounts` nur noch für `byKind` (Kanäle); `cardTotalCents` aus dem Aggregat nicht mehr nutzen.
- `computeSettlementWarnings(...)`: `terminalsTotalCents: physicalTerminalCents`, `glCardCents`, **kein** `deliveryWoltCents`.
- Terminal-Bannertext: „**Terminal-Differenz** — Σ Terminals ({fmtCents terminalsCents} €) ≠ Kellner-Karten ({waiterCardCents} €) + GL ({glCardCents} €). Differenz: {fmtSignedCents diff}."

## Nicht anfassen
- Cash-Ledger / `computeDailyCash`, Kanal-`kind`-Auflösung (`kindRows`), Settlement-Reader.
- **Wolt bleibt im Geld-Pfad.** `deliveryWoltCents` AUSSCHLIESSLICH aus `SettlementWarningInput` (settlement-warnings.ts) entfernen. NICHT entfernen aus: `cash-ledger.ts`, `session-day-input.ts`, `session-channels.ts`, `pdfExport.ts`, `kasse-saldo.tsx`, `bargeld-export.ts`, `cash.functions.ts`-Aggregate. Dort bleibt Wolt gebuchter Umsatz im Bargeld-/Saldo-/Export-Pfad — nur der Settlement-ABGLEICH zieht Wolt nicht mehr ab.

## Erfolgs-Gate
- `tsc` 0, `eslint src/ --max-warnings=5` 0, `vitest run` grün inkl. neuer Fixtures.
- `npx prettier --write` über alle geänderten Dateien vor dem Commit.
- Manuell: Spicery 10.06.2026 zeigt kein Banner mehr (vorher POS −772,00 / Terminal +31,80).
