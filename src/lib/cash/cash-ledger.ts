// Kassensaldo-Kette (Carry-over) als reines Modul (B3a).
//
// Konzept aus Altsystem (useCashBalanceData + compute_carry_over),
// hier zentralisiert. Die Logik ist bewusst minimal und nachvollziehbar
// — die Golden-Master-Fixture (vom externen Prüfer) ist die finale
// Charakterisierung; der Platzhalter dient nur als Smoke-Test.
//
// Saldo-Berechnung je Tag:
//
//   delta = grossRevenue
//         + vouchersSold      − vouchersRedeemed     − finedineVouchers
//         − Σ expenses
//         − Σ advances
//         + Σ cardTransactions (negativ wenn Erstattung — Schema lässt
//           negative Beträge zu)
//         − Σ bankDeposits
//         + Σ registerTransfers(to_restaurant) − Σ (from_restaurant)
//
// Begründung der Vorzeichen:
//   * Gutschein-Verkauf: Bargeld kommt rein, Umsatz aber nicht (siehe
//     session-channels.ts) → addiert auf Cash-Delta.
//   * Gutschein-Einlösung & FineDine-Gutschein: Bargeld weniger als
//     Umsatz → subtrahiert.
//   * Ausgaben, Vorschüsse, Bank-Einzahlung: Cash raus.
//   * Kartenumsatz ist bereits in `terminalAmounts` (= Umsatz). Der
//     Saldo subtrahiert Karten NICHT erneut — siehe Test
//     "cash-ledger ignoriert keinen Kartenumsatz doppelt".
//     `cardTransactions` ist hier eine SEPARATE Korrekturliste
//     (z. B. nachträgliche Karten-Buchung, die nicht im Terminal-Topf
//     ist) — Normalfall: leer.
//   * Register-Transfer to_restaurant = Cash kommt rein (z. B. Tresor
//     → Kasse), from_restaurant = Cash raus.
//
// Carry-over: balance[n] = balance[n-1] + delta[n]. Ein negativer
// Vortagessaldo bleibt sichtbar (kein Reset auf 0), damit Defizite
// nicht unbemerkt verschwinden.

export type DaySatellites = {
  expensesCents: number[];
  advancesCents: number[];
  cardTransactionsCents: number[];
  bankDepositsCents: number[];
  registerTransfersToCents: number[];
  registerTransfersFromCents: number[];
};

export type DayInput = {
  businessDate: string; // ISO YYYY-MM-DD
  grossRevenueCents: number;
  vouchersSoldCents: number;
  vouchersRedeemedCents: number;
  finedineVouchersCents: number;
  satellites: DaySatellites;
};

export type DayResult = {
  businessDate: string;
  deltaCents: number;
  balanceCents: number;
  deficitCarriedFromPreviousCents: number; // 0 wenn Vortag ≥ 0
};

export function computeDayDelta(day: DayInput): number {
  const s = day.satellites;
  const sumExp = sumInt(s.expensesCents, "expenses");
  const sumAdv = sumInt(s.advancesCents, "advances");
  const sumCard = sumInt(s.cardTransactionsCents, "cardTransactions");
  const sumDep = sumInt(s.bankDepositsCents, "bankDeposits");
  const sumTo = sumInt(s.registerTransfersToCents, "transfersTo");
  const sumFrom = sumInt(s.registerTransfersFromCents, "transfersFrom");
  return (
    asInt(day.grossRevenueCents, "grossRevenue") +
    asInt(day.vouchersSoldCents, "vouchersSold") -
    asInt(day.vouchersRedeemedCents, "vouchersRedeemed") -
    asInt(day.finedineVouchersCents, "finedineVouchers") -
    sumExp -
    sumAdv +
    sumCard -
    sumDep +
    sumTo -
    sumFrom
  );
}

export function accumulateChain(openingBalanceCents: number, days: DayInput[]): DayResult[] {
  if (!Number.isInteger(openingBalanceCents))
    throw new Error("openingBalanceCents must be integer cents");
  // Tage müssen lexikographisch aufsteigend sortiert sein (ISO-Datum).
  for (let i = 1; i < days.length; i += 1) {
    if (days[i].businessDate <= days[i - 1].businessDate) {
      throw new Error(
        `days not strictly ascending at index ${i}: ${days[i - 1].businessDate} → ${days[i].businessDate}`,
      );
    }
  }
  const out: DayResult[] = [];
  let balance = openingBalanceCents;
  for (const d of days) {
    const prevBalance = balance;
    const delta = computeDayDelta(d);
    balance = prevBalance + delta;
    out.push({
      businessDate: d.businessDate,
      deltaCents: delta,
      balanceCents: balance,
      deficitCarriedFromPreviousCents: prevBalance < 0 ? -prevBalance : 0,
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
