## Fix: `delivery_vectron` (Take-Away) wird doppelt vom Bargeld abgezogen

### Diagnose (bestätigt durch DB-Query Mo 01.06 YUM)

- `vectron_daily_total_cents` = 5.196,40 € (enthält Take-away).
- Kanal `delivery_vectron` ("In-House Take-away") = 535,70 € (= Teilmenge des Tagesumsatzes).
- Switch in `loadCashDayAggregates` (`src/lib/cash/cash.functions.ts` Z. 1970–1972) wirft `delivery_vectron` und `delivery_souse` in **denselben Topf** `a.deliverySouse`.
- `getCashDailyBreakdownCore` überschreibt `grossRevenueCents` mit `a.vectronDailyTotal`, sodass `computeDailyCash` den Take-away-Anteil ein zweites Mal abzieht.
- Live-Soll: `5196,40 − 4034,44 − 245 − 480,50 − 50 − 50 = 336,46 €`.
- COCO-Ist: `5196,40 − 4034,44 − 780,70 − 480,50 − 50 − 50 = −199,24 €` (Diff = 535,70 €).

Regel: Take-away ist Vectron-Bar (bereits im Tagesumsatz). Darf in der Cash-Formel **nie** subtrahiert werden — analog zu `pos`.

### 1. `src/lib/cash/cash.functions.ts`

(a) Switch (Z. 1967–1976): `delivery_vectron` aus dem `deliverySouse`-Block herauslösen. Routing zusätzlich in eine reine, exportierte Funktion `applyRevenueChannel(a, kind, amt)` extrahieren — der Loop ruft sie auf. So fängt der Test ein erneutes Zusammenlegen.

```ts
export function applyRevenueChannel(a: CashDayAgg, kind: string | null, amt: number): void {
  switch (kind) {
    case "pos": a.grossRevenue += amt; break;
    case "delivery_souse": a.deliverySouse += amt; break;
    case "delivery_vectron": a.deliveryVectron += amt; break;
    case "delivery_wolt": a.deliveryWolt += amt; break;
    case "voucher_sold": a.vouchersSold += amt; break;
    case "voucher_redeemed": a.vouchersRedeemed += amt; break;
    case "finedine": a.finedine += amt; break;
    case "einladung": a.einladung += amt; break;
    case "sonstige": a.sonstige += amt; break;
    default: break;
  }
}
```

(b) `CashDayAgg`: Feld `deliveryVectron: number;` ergänzen.
(c) `makeEmptyAgg()`: `deliveryVectron: 0,` ergänzen.
(d) `CashDailyRow`: `deliveryVectronCents: number;` ergänzen.
(e) Rückgabe in `getCashDailyBreakdownCore`: zusätzlich `deliveryVectronCents: a.deliveryVectron`.

**Nicht ändern:** `aggToDayInput`, `computeDailyCash`, `cash-ledger.ts`, der `grossRevenue`-Override. `delivery_vectron` fließt bewusst nicht in `DayInput`.

Hinweis: `loadCashDayAggregates` speist auch `getCashLedgerCore`. Dort verliert `deliverySouseCents` ebenfalls den Take-away — korrekt und gewollt; verschiebt aber die Saldokette an `delivery_vectron`-Tagen (kein Sonderpfad).

### 2. Regressions-Test (`src/lib/cash/cash-channels.test.ts`)

- **Routing**: `applyRevenueChannel` mit den Mo-01.06-Kanälen → `a.deliverySouse === 24500`, `a.deliveryVectron === 53570`. Stellt sicher, dass `delivery_vectron` **nicht** in `deliverySouse` landet.
- **Formel**: `computeDailyCash` mit `grossRevenueCents=519640, cardTotalCents=403444, deliverySouseCents=24500, deliveryWoltCents=48050, vouchersRedeemedCents=5000, finedineVouchersCents=5000` → `33646` (= 336,46 €).

### 3. UI: `src/routes/_authenticated/admin/kasse-saldo.tsx`

Neue Info-Spalte **„Take-Away"** (`deliveryVectronCents`) links neben „OrderSmart". Nur informativ — kein Vorzeichen, keine Farbcodierung. `totals` + Footer ergänzen.

### 4. Excel-Export: `src/lib/cash/bargeld-export.ts`

Neue Spalte „Take-Away" (`deliveryVectronCents`) analog zur UI; Footer summieren; Spaltenformat 13 Spalten → 14.

### Nicht anfassen

`computeDailyCash` / `cash-ledger.ts`, `accumulateChain`, Bank-Deposits, Carry-Logik, `revenue_channels`-Schema/Daten (keine Migration), `pdfExport` / `cashBalance` über den Aggregator hinaus.

### Erfolgs-Gate

- `vitest run src/lib/cash` grün, neuer Routing- + Formel-Test inkl.
- `tsc --noEmit`, `eslint . --max-warnings=5`, CI grün.
- Vor Commit: `npx prettier --write` + `npx eslint --fix` über die geänderten Dateien.
- Manuell: Mo 01.06 zeigt Bargeld **336,46 €** (grün), OrderSmart 245,00 €, Take-Away 535,70 €; Monatssumme deckt sich mit Live-Tagesabrechnungen.
