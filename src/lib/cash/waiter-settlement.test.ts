import { describe, expect, it } from "vitest";
import { calcWaiterSettlement, waiterNetTipCents } from "./waiter-settlement";

describe("calcWaiterSettlement", () => {
  it("Standardfall: differenz = pos+hilf−open−card, kitchen_tip = round(pos*rate)", () => {
    const r = calcWaiterSettlement({
      posSalesCents: 100_00,
      cardTotalCents: 60_00,
      hilfMahlCents: 5_00,
      openInvoicesCents: 10_00,
      kitchenTipRate: 0.02,
    });
    // differenz = 10000 + 500 − 1000 − 6000 = 3500
    // kitchen_tip = round(10000 * 0.02) = 200
    expect(r).toEqual({ differenzCents: 3500, kitchenTipCents: 200 });
  });

  it("negative Differenz wird durchgereicht (Kellner hat zu wenig abgegeben)", () => {
    const r = calcWaiterSettlement({
      posSalesCents: 100_00,
      cardTotalCents: 120_00,
      hilfMahlCents: 0,
      openInvoicesCents: 0,
      kitchenTipRate: 0.02,
    });
    expect(r.differenzCents).toBe(-2000);
  });

  it("kitchen_tip kaufmännisch gerundet (Half-Away-From-Zero) bei 49.5 Cents", () => {
    // 24_75 * 0.02 = 49.5 → 50
    const r = calcWaiterSettlement({
      posSalesCents: 2475,
      cardTotalCents: 0,
      hilfMahlCents: 0,
      openInvoicesCents: 0,
      kitchenTipRate: 0.02,
    });
    expect(r.kitchenTipCents).toBe(50);
  });

  it("kitchen_tip = 0 bei kitchen_tip_rate = 0 (z. B. Spätschicht ohne Küchen-Beteiligung)", () => {
    const r = calcWaiterSettlement({
      posSalesCents: 1_000_00,
      cardTotalCents: 0,
      hilfMahlCents: 0,
      openInvoicesCents: 0,
      kitchenTipRate: 0,
    });
    expect(r.kitchenTipCents).toBe(0);
  });

  it("kitchen_tip mit YUM-Rate 3 % cent-genau", () => {
    // pos = 333_33 cents, * 0.03 = 999.99 → round → 1000
    const r = calcWaiterSettlement({
      posSalesCents: 33_333,
      cardTotalCents: 0,
      hilfMahlCents: 0,
      openInvoicesCents: 0,
      kitchenTipRate: 0.03,
    });
    expect(r.kitchenTipCents).toBe(1000);
  });

  it("verweigert nicht-ganzzahlige Cent-Beträge (Drift-Schutz)", () => {
    expect(() =>
      calcWaiterSettlement({
        posSalesCents: 100.5,
        cardTotalCents: 0,
        hilfMahlCents: 0,
        openInvoicesCents: 0,
        kitchenTipRate: 0.02,
      }),
    ).toThrow(/integer cents/);
  });

  it("verweigert kitchen_tip_rate außerhalb [0,1]", () => {
    expect(() =>
      calcWaiterSettlement({
        posSalesCents: 100,
        cardTotalCents: 0,
        hilfMahlCents: 0,
        openInvoicesCents: 0,
        kitchenTipRate: 1.5,
      }),
    ).toThrow(/kitchenTipRate/);
  });
});
