// Kassensaldo-Kette (Carry-over) — reines Modul, B3-Modellkorrektur Teil B.
//
// Formel exakt nach Alt-Modell `dailyCash` (siehe
// `befund-kasse-modell-und-standort.md`, Befund 2). Vorzeichen-Begründung:
//
//   * grossRevenue (POS-Umsatz)               → +
//   * vouchersSold (Verkauf)                  → +  (Bar rein, kein Umsatz)
//   * sonstigeEinnahme                        → +
//   * cardTotal (Σ Terminals)                 → −  (Umsatz, aber NICHT Bar)
//   * deliverySouse / deliveryWolt            → −  (Plattform zieht ein)
//   * vouchersRedeemed / finedineVouchers     → −  (Umsatz, aber kein Bar)
//   * einladung                               → −  (Umsatz, aber kein Bar)
//   * Σ openInvoices                          → −  (offene Rechnung, kein Bar)
//   * effectiveVorschuss                      → −  (Liste ODER Pauschalfeld,
//                                                  niemals additiv — Quirk
//                                                  Alt-Modell)
//   * Σ expenses                              → −
//   * Σ cardTransactions                      →    NICHT TEIL DER FORMEL
//     (Alt-Code `useCashBalanceData.ts` kennt nur `cardTotal`, keine
//     separate Addition; Tabelle/Reader bleiben, werden hier ignoriert.)
//
//   transferEffect = Σ to_restaurant − Σ (to_safe | to_other | from_restaurant)
//     (`from_restaurant` = Legacy-Enum-Wert, semantisch outflow.)
//
//   rawBargeld   = dailyCash + transferEffect
//   chained      = rawBargeld + previousCarry   (previousCarry darf < 0 sein)
//   bankDeposits laufen NACH dem Carry, eigene Stufe:
//   remaining    = chained − Σ bankDeposits
//   carry        = remaining   (auch negativ — Defizit wandert weiter)
//
// Felder sind technisch-neutral (`deliverySouseCents`, `deliveryWoltCents`);
// die UI bildet sie aus `revenue_channels.kind` (kein Anbietername im Code).

export type TransferDirection = "to_restaurant" | "to_safe" | "to_other" | "from_restaurant";

export type DaySatellites = {
  expensesCents: number[];
  advancesCents: number[];
  /** Wird NICHT in dailyCash verrechnet — siehe Header. */
  cardTransactionsCents: number[];
  /** Eigene Ketten-Stufe NACH Carry. */
  bankDepositsCents: number[];
  registerTransfers: Array<{ direction: TransferDirection; amountCents: number }>;
};

export type DayInput = {
  businessDate: string; // ISO YYYY-MM-DD
  grossRevenueCents: number; // POS
  cardTotalCents: number; // Σ Terminals
  deliverySouseCents: number; // ex-"ordersmart"
  deliveryWoltCents: number;
  vouchersSoldCents: number;
  vouchersRedeemedCents: number;
  finedineVouchersCents: number;
  einladungCents: number;
  openInvoicesCents: number[];
  sonstigeEinnahmeCents: number;
  /**
   * Pauschal-Vorschuss (Session-Feld). Quirk: wenn `satellites.advancesCents`
   * mindestens einen Eintrag hat, gilt deren Summe und dieses Feld wird
   * ignoriert (Alt-Modell hat die beiden Eingaben nie additiv).
   */
  vorschussCents: number;
  satellites: DaySatellites;
};

export type DayResult = {
  businessDate: string;
  dailyCashCents: number;
  transferEffectCents: number;
  rawBargeldCents: number;
  previousCarryCents: number;
  chainedCents: number;
  bankDepositsTotalCents: number;
  remainingCashCents: number;
  /** Alias auf `remainingCashCents` (= neuer Saldo nach Einzahlungen). */
  balanceCents: number;
  /** = max(0, −previousCarry). 0 wenn Vortag ≥ 0. */
  deficitCarriedFromPreviousCents: number;
};

export function effectiveVorschussCents(day: DayInput): number {
  const list = day.satellites.advancesCents;
  if (list.length > 0) return sumInt(list, "advances");
  return asInt(day.vorschussCents, "vorschuss");
}

export function computeDailyCash(day: DayInput): number {
  const s = day.satellites;
  const sumExp = sumInt(s.expensesCents, "expenses");
  const sumOpen = sumInt(day.openInvoicesCents, "openInvoices");
  return (
    asInt(day.grossRevenueCents, "grossRevenue") +
    asInt(day.vouchersSoldCents, "vouchersSold") +
    asInt(day.sonstigeEinnahmeCents, "sonstigeEinnahme") -
    asInt(day.cardTotalCents, "cardTotal") -
    asInt(day.deliverySouseCents, "deliverySouse") -
    asInt(day.deliveryWoltCents, "deliveryWolt") -
    asInt(day.vouchersRedeemedCents, "vouchersRedeemed") -
    asInt(day.finedineVouchersCents, "finedineVouchers") -
    asInt(day.einladungCents, "einladung") -
    sumOpen -
    effectiveVorschussCents(day) -
    sumExp
  );
}

export function computeTransferEffect(day: DayInput): number {
  let effect = 0;
  const list = day.satellites.registerTransfers;
  for (let i = 0; i < list.length; i += 1) {
    const t = list[i];
    const amt = asInt(t.amountCents, `transfers[${i}].amount`);
    effect += t.direction === "to_restaurant" ? amt : -amt;
  }
  return effect;
}

export function accumulateChain(openingBalanceCents: number, days: DayInput[]): DayResult[] {
  if (!Number.isInteger(openingBalanceCents))
    throw new Error("openingBalanceCents must be integer cents");
  for (let i = 1; i < days.length; i += 1) {
    if (days[i].businessDate <= days[i - 1].businessDate) {
      throw new Error(
        `days not strictly ascending at index ${i}: ${days[i - 1].businessDate} → ${days[i].businessDate}`,
      );
    }
  }
  const out: DayResult[] = [];
  let carry = openingBalanceCents;
  for (const d of days) {
    const previousCarry = carry;
    const dailyCash = computeDailyCash(d);
    const transferEffect = computeTransferEffect(d);
    const rawBargeld = dailyCash + transferEffect;
    const chained = rawBargeld + previousCarry;
    const bankDepositsTotal = sumInt(d.satellites.bankDepositsCents, "bankDeposits");
    const remaining = chained - bankDepositsTotal;
    carry = remaining;
    out.push({
      businessDate: d.businessDate,
      dailyCashCents: dailyCash,
      transferEffectCents: transferEffect,
      rawBargeldCents: rawBargeld,
      previousCarryCents: previousCarry,
      chainedCents: chained,
      bankDepositsTotalCents: bankDepositsTotal,
      remainingCashCents: remaining,
      balanceCents: remaining,
      deficitCarriedFromPreviousCents: previousCarry < 0 ? -previousCarry : 0,
    });
  }
  return out;
}

function asInt(value: number, name: string): number {
  if (!Number.isInteger(value)) throw new Error(`${name} must be integer cents`);
  return value;
}
function sumInt(values: number[], name: string): number {
  let total = 0;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (!Number.isInteger(v)) throw new Error(`${name}[${i}] must be integer cents`);
    total += v;
  }
  return total;
}
