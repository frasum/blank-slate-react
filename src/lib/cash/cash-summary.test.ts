import { describe, it, expect } from "vitest";
import { computeSummaryRows } from "./cash-summary";
import type { DayInput } from "./cash-ledger";

function emptyDay(overrides: Partial<DayInput> = {}): DayInput {
  return {
    businessDate: "2026-06-17",
    grossRevenueCents: 0,
    cardTotalCents: 0,
    deliverySouseCents: 0,
    deliveryWoltCents: 0,
    vouchersSoldCents: 0,
    vouchersRedeemedCents: 0,
    finedineVouchersCents: 0,
    einladungCents: 0,
    openInvoicesCents: [],
    sonstigeEinnahmeCents: 0,
    vorschussCents: 0,
    satellites: {
      expensesCents: [],
      advancesCents: [],
      cardTransactionsCents: [],
      bankDepositsCents: [],
      registerTransfers: [],
    },
    ...overrides,
  };
}

describe("computeSummaryRows", () => {
  it("cashActual=null → Differenz null, Tresor = Tages-Bargeld", () => {
    const r = computeSummaryRows({
      dayInput: emptyDay({ grossRevenueCents: 33_646 }),
      cashActualCents: null,
      cashTargetCents: 200_000,
    });
    expect(r.tagesBargeldCents).toBe(33_646);
    expect(r.differenzCents).toBeNull();
    expect(r.tresorCents).toBe(33_646);
  });

  it("Überschuss: Diff > 0, Tresor = Bargeld − Diff", () => {
    const r = computeSummaryRows({
      dayInput: emptyDay({ grossRevenueCents: 33_646 }),
      cashActualCents: 210_000,
      cashTargetCents: 200_000,
    });
    expect(r.tagesBargeldCents).toBe(33_646);
    expect(r.differenzCents).toBe(10_000);
    expect(r.tresorCents).toBe(23_646);
  });

  it("Fehlbetrag: Diff < 0, Tresor = Bargeld + |Diff|", () => {
    const r = computeSummaryRows({
      dayInput: emptyDay({ grossRevenueCents: 33_646 }),
      cashActualCents: 195_000,
      cashTargetCents: 200_000,
    });
    expect(r.differenzCents).toBe(-5_000);
    expect(r.tresorCents).toBe(38_646);
  });

  it("Soll exakt: Diff 0, Tresor = Bargeld", () => {
    const r = computeSummaryRows({
      dayInput: emptyDay({ grossRevenueCents: 33_646 }),
      cashActualCents: 200_000,
      cashTargetCents: 200_000,
    });
    expect(r.differenzCents).toBe(0);
    expect(r.tresorCents).toBe(33_646);
  });
});
