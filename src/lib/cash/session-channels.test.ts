import { describe, expect, it } from "vitest";
import { aggregateSessionRevenue } from "./session-channels";

describe("aggregateSessionRevenue", () => {
  it("Summiert Kanäle + Terminals + sonstige, subtrahiert Korrekturen", () => {
    const r = aggregateSessionRevenue({
      channelAmountsCents: [500_00, 80_00, 30_00], // POS, Wolt, UberEats
      terminalAmountsCents: [200_00, 50_00],
      sonstigeEinnahmeCents: 5_00,
      opentabsDeductionCents: 12_00,
      vorschussCents: 25_00,
      einladungCents: 8_00,
    });
    expect(r.channelsTotalCents).toBe(610_00);
    expect(r.terminalsTotalCents).toBe(250_00);
    // 61000 + 25000 + 500 − 1200 − 2500 − 800 = 82000
    expect(r.grossRevenueCents).toBe(82_000);
  });

  it("Leere Listen → 0", () => {
    const r = aggregateSessionRevenue({
      channelAmountsCents: [],
      terminalAmountsCents: [],
      sonstigeEinnahmeCents: 0,
      opentabsDeductionCents: 0,
      vorschussCents: 0,
      einladungCents: 0,
    });
    expect(r.grossRevenueCents).toBe(0);
  });

  it("Verweigert nicht-ganzzahlige Beträge", () => {
    expect(() =>
      aggregateSessionRevenue({
        channelAmountsCents: [100, 50.5],
        terminalAmountsCents: [],
        sonstigeEinnahmeCents: 0,
        opentabsDeductionCents: 0,
        vorschussCents: 0,
        einladungCents: 0,
      }),
    ).toThrow(/integer cents/);
  });
});