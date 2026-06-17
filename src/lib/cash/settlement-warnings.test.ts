import { describe, expect, it } from "vitest";
import { computeSettlementWarnings } from "./settlement-warnings";

function base() {
  return {
    hasSettlements: true,
    posTotalCents: 0,
    deliveryVectronCents: 0,
    deliverySouseCents: 0,
    deliveryWoltCents: 0,
    terminalsTotalCents: 0,
    waiterPosSalesCents: [] as number[],
    waiterCardTotalCents: [] as number[],
  };
}

describe("computeSettlementWarnings", () => {
  it("returns [] when there are no settlements, even with huge diffs", () => {
    const r = computeSettlementWarnings({
      ...base(),
      hasSettlements: false,
      posTotalCents: 100_000,
      terminalsTotalCents: 50_000,
    });
    expect(r).toEqual([]);
  });

  it("returns [] when everything matches exactly", () => {
    const r = computeSettlementWarnings({
      ...base(),
      posTotalCents: 15_000,
      deliverySouseCents: 2_000,
      deliveryWoltCents: 1_000,
      deliveryVectronCents: 500,
      terminalsTotalCents: 8_000,
      waiterPosSalesCents: [6_000, 5_500],
      waiterCardTotalCents: [3_000, 5_000],
    });
    expect(r).toEqual([]);
  });

  it("returns single pos_diff with correct sign when only POS is off (+)", () => {
    const r = computeSettlementWarnings({
      ...base(),
      posTotalCents: 10_050,
      waiterPosSalesCents: [10_000],
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: "pos_diff", diffCents: 50 });
  });

  it("returns single pos_diff with correct sign when only POS is off (-)", () => {
    const r = computeSettlementWarnings({
      ...base(),
      posTotalCents: 10_000,
      waiterPosSalesCents: [10_050],
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: "pos_diff", diffCents: -50 });
  });

  it("returns single terminal_diff when only terminals off", () => {
    const r = computeSettlementWarnings({
      ...base(),
      terminalsTotalCents: 8_000,
      waiterCardTotalCents: [7_900],
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: "terminal_diff", diffCents: 100 });
  });

  it("returns both warnings in order pos_diff, terminal_diff", () => {
    const r = computeSettlementWarnings({
      ...base(),
      posTotalCents: 10_100,
      waiterPosSalesCents: [10_000],
      terminalsTotalCents: 5_000,
      waiterCardTotalCents: [4_950],
    });
    expect(r.map((w) => w.kind)).toEqual(["pos_diff", "terminal_diff"]);
  });

  it("warns at exactly 1 cent diff", () => {
    const r = computeSettlementWarnings({
      ...base(),
      posTotalCents: 10_001,
      waiterPosSalesCents: [10_000],
    });
    expect(r).toHaveLength(1);
    expect(r[0].diffCents).toBe(1);
  });

  it("does not warn at 0 cent diff", () => {
    const r = computeSettlementWarnings({
      ...base(),
      posTotalCents: 10_000,
      waiterPosSalesCents: [10_000],
    });
    expect(r).toEqual([]);
  });

  it("throws on non-integer input", () => {
    expect(() =>
      computeSettlementWarnings({
        ...base(),
        posTotalCents: 10.5,
        waiterPosSalesCents: [10],
      }),
    ).toThrow();
    expect(() =>
      computeSettlementWarnings({
        ...base(),
        waiterCardTotalCents: [1.2],
        terminalsTotalCents: 1,
      }),
    ).toThrow();
  });
});
