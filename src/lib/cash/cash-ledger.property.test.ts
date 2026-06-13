// Property-Test (B3-Modellkorrektur): accumulateChain ist split-assoziativ.
// Für jede Aufteilungsstelle k gilt:
//   accumulate(opening, days)
//     === accumulate(opening, days[..k]) ++ accumulate(tailCarry, days[k..])
// Damit ist die Kette inkrementell sicher (alte Tage werden durch ihren
// Endsaldo vollständig beschrieben, ein neu eingefügter Tag rechnet nichts
// rückwirkend neu).

import { describe, expect, it } from "vitest";
import { accumulateChain, type DayInput, type TransferDirection } from "./cash-ledger";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pad(n: number, w: number): string {
  return n.toString().padStart(w, "0");
}

const DIRS: TransferDirection[] = ["to_restaurant", "to_safe", "to_other", "from_restaurant"];

function makeDays(n: number, rnd: () => number): DayInput[] {
  const out: DayInput[] = [];
  const start = new Date(Date.UTC(2026, 0, 1));
  for (let i = 0; i < n; i += 1) {
    const d = new Date(start.getTime() + i * 86_400_000);
    const iso = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`;
    const positive = (m: number) => Math.floor(rnd() * m);
    const useList = rnd() < 0.5;
    out.push({
      businessDate: iso,
      grossRevenueCents: positive(500_000),
      cardTotalCents: positive(300_000),
      deliverySouseCents: positive(50_000),
      deliveryWoltCents: positive(50_000),
      vouchersSoldCents: positive(40_000),
      vouchersRedeemedCents: positive(30_000),
      finedineVouchersCents: positive(20_000),
      einladungCents: positive(10_000),
      openInvoicesCents: [positive(15_000), positive(15_000)],
      sonstigeEinnahmeCents: positive(5_000),
      // Quirk: niemals beide gleichzeitig.
      vorschussCents: useList ? 0 : positive(50_000),
      satellites: {
        expensesCents: [positive(20_000)],
        advancesCents: useList ? [positive(40_000)] : [],
        cardTransactionsCents: [positive(10_000)],
        bankDepositsCents: [positive(200_000)],
        registerTransfers: [
          { direction: DIRS[Math.floor(rnd() * DIRS.length)], amountCents: positive(60_000) },
          { direction: DIRS[Math.floor(rnd() * DIRS.length)], amountCents: positive(60_000) },
        ],
      },
    });
  }
  return out;
}

describe("cash-ledger: Property — Kette ist split-assoziativ", () => {
  const SEEDS = [1, 7, 42, 1337, 2026];

  for (const seed of SEEDS) {
    it(`seed=${seed}: jede Aufteilung k liefert dasselbe Endergebnis wie der Ein-Pass`, () => {
      const rnd = mulberry32(seed);
      const opening = Math.floor(rnd() * 1_000_000) - 500_000;
      const days = makeDays(20, rnd);
      const onePass = accumulateChain(opening, days);

      for (let k = 1; k < days.length; k += 1) {
        const head = accumulateChain(opening, days.slice(0, k));
        const tailOpening = head[head.length - 1].balanceCents;
        const tail = accumulateChain(tailOpening, days.slice(k));
        expect([...head, ...tail]).toEqual(onePass);
      }
    });
  }

  it("Ein-Tages-Schritte: 20 einzelne Aufrufe == 1 Aufruf über 20 Tage", () => {
    const rnd = mulberry32(99);
    const opening = 250_000;
    const days = makeDays(20, rnd);
    const onePass = accumulateChain(opening, days);
    const stepwise: ReturnType<typeof accumulateChain> = [];
    let bal = opening;
    for (const d of days) {
      const r = accumulateChain(bal, [d]);
      stepwise.push(...r);
      bal = r[0].balanceCents;
    }
    expect(stepwise).toEqual(onePass);
  });
});
