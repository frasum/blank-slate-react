/**
 * Golden-Master-Harness (B3-Modellkorrektur Teil B).
 * Platzhalter-Fixture nach neuer Formel; wird durch echte Fixture des
 * unabhängigen Prüfers ersetzt (zwei Ketten, eine je Standort).
 */

import { describe, expect, it } from "vitest";
import fixture from "./cashBalance.json";
import { accumulateChain, type DayInput } from "../cash-ledger";
import { calcWaiterSettlement } from "../waiter-settlement";

type FixtureDay = DayInput & {
  waiters: Array<{
    pseudonym: string;
    input: {
      posSalesCents: number;
      cardTotalCents: number;
      hilfMahlCents: number;
      openInvoicesCents: number;
      kitchenTipRate: number;
    };
    expected: { differenzCents: number; kitchenTipCents: number };
  }>;
  expected: {
    dailyCashCents: number;
    transferEffectCents: number;
    rawBargeldCents: number;
    previousCarryCents: number;
    chainedCents: number;
    bankDepositsTotalCents: number;
    remainingCashCents: number;
    balanceCents: number;
    deficitCarriedFromPreviousCents: number;
  };
};

type Fixture = {
  meta: { source: string; kitchenTipRate: number; note?: string };
  openingBalanceCents: number;
  days: FixtureDay[];
};

const fx = fixture as unknown as Fixture;

describe(`Golden Master: cashBalance (${fx.meta.source})`, () => {
  it("Fixture hat ein nicht-leeres days[]", () => {
    expect(fx.days.length).toBeGreaterThan(0);
  });

  it("Tages-Saldo-Kette reproduziert sich cent-genau", () => {
    const days: DayInput[] = fx.days.map((d) => ({
      businessDate: d.businessDate,
      grossRevenueCents: d.grossRevenueCents,
      cardTotalCents: d.cardTotalCents,
      deliverySouseCents: d.deliverySouseCents,
      deliveryWoltCents: d.deliveryWoltCents,
      vouchersSoldCents: d.vouchersSoldCents,
      vouchersRedeemedCents: d.vouchersRedeemedCents,
      finedineVouchersCents: d.finedineVouchersCents,
      einladungCents: d.einladungCents,
      openInvoicesCents: d.openInvoicesCents,
      sonstigeEinnahmeCents: d.sonstigeEinnahmeCents,
      vorschussCents: d.vorschussCents,
      satellites: d.satellites,
    }));
    const result = accumulateChain(fx.openingBalanceCents, days);
    const expected = fx.days.map((d) => ({ businessDate: d.businessDate, ...d.expected }));
    expect(result).toEqual(expected);
  });

  for (const d of fx.days) {
    for (const w of d.waiters) {
      it(`Kellner ${w.pseudonym} am ${d.businessDate} reproduziert sich cent-genau`, () => {
        expect(calcWaiterSettlement(w.input)).toEqual(w.expected);
      });
    }
  }
});