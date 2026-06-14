// B5 — Tresorbestand-Kette (reines Modul).
//
// Logik je Tag:
//   surplus    = max(0, cash_actual - cash_target)   // > 0: Überschuss
//   shortfall  = max(0, cash_target - cash_actual)   // > 0: Fehlbetrag
//   safe[N]    = safe[N-1] + surplus[N] - Σ bankDeposits[N]
//
// Fehlbetrag beeinflusst den Tresor NICHT (nur Information).
// cash_actual = null → surplus/shortfall = null, Tresor unverändert,
// Bankeinzahlungen werden trotzdem abgezogen.

export type SafeDayInput = {
  businessDate: string;
  cashActualCents: number | null;
  cashTargetCents: number;
  bankDepositsCents: number[];
};

export type SafeDayResult = {
  businessDate: string;
  cashActualCents: number | null;
  surplusCents: number | null;
  shortfallCents: number | null;
  safeBalanceCents: number;
};

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

export function computeSafeChain(
  openingSafeBalanceCents: number,
  days: SafeDayInput[],
): SafeDayResult[] {
  if (!Number.isInteger(openingSafeBalanceCents))
    throw new Error("openingSafeBalanceCents must be integer cents");
  for (let i = 1; i < days.length; i += 1) {
    if (days[i].businessDate <= days[i - 1].businessDate) {
      throw new Error(
        `days not strictly ascending at index ${i}: ${days[i - 1].businessDate} → ${days[i].businessDate}`,
      );
    }
  }
  const out: SafeDayResult[] = [];
  let safe = openingSafeBalanceCents;
  for (const d of days) {
    const target = asInt(d.cashTargetCents, "cashTarget");
    const deposits = sumInt(d.bankDepositsCents, "bankDeposits");
    let surplus: number | null = null;
    let shortfall: number | null = null;
    if (d.cashActualCents !== null) {
      const actual = asInt(d.cashActualCents, "cashActual");
      const diff = actual - target;
      surplus = diff > 0 ? diff : 0;
      shortfall = diff < 0 ? -diff : 0;
      safe += surplus;
    }
    safe -= deposits;
    out.push({
      businessDate: d.businessDate,
      cashActualCents: d.cashActualCents,
      surplusCents: surplus,
      shortfallCents: shortfall,
      safeBalanceCents: safe,
    });
  }
  return out;
}