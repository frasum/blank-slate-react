import { describe, it, expect } from "vitest";
import { computeSummaryRows, computeWechselgeld, rollOperativeDeficitCents } from "./cash-summary";
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

describe("rollOperativeDeficitCents", () => {
  it("leere Liste → 0", () => {
    expect(rollOperativeDeficitCents([])).toBe(0);
  });
  it("Überschuss wird täglich abgeschöpft, Folgetag bringt eigenes Defizit", () => {
    // Tag 1: +5000 → sofort abgeschöpft (Bal 0). Tag 2: -2000 (Bal -2000).
    expect(rollOperativeDeficitCents([5000, -2000])).toBe(-2000);
  });
  it("Defizit läuft auf", () => {
    expect(rollOperativeDeficitCents([-3000, -1000])).toBe(-4000);
  });
  it("teils gedeckt", () => {
    expect(rollOperativeDeficitCents([-3000, 1000])).toBe(-2000);
  });
});

describe("computeWechselgeld", () => {
  it("ohne Vortagsdefizit: Tresor = Bargeld, Wechselgeld = Soll", () => {
    expect(
      computeWechselgeld({
        tagesBargeldCents: 5000,
        previousDeficitCents: 0,
        cashTargetCents: 200_000,
      }),
    ).toEqual({ diffCents: 5000, tresorCents: 5000, wechselgeldbestandCents: 200_000 });
  });
  it("Vortagsdefizit zieht Wechselgeld unter Soll, Tresor = 0 bei diff<0", () => {
    expect(
      computeWechselgeld({
        tagesBargeldCents: 1000,
        previousDeficitCents: -3000,
        cashTargetCents: 200_000,
      }),
    ).toEqual({ diffCents: -2000, tresorCents: 0, wechselgeldbestandCents: 198_000 });
  });
});
