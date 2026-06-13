/**
 * Golden-Master-Test (B3a-Kasse, Primärreferenz).
 *
 * Reproduziert die Tages-Saldo-Kette und alle Kellner-Settlements der
 * Fixture cent-genau (toEqual, Toleranz 0). Struktur analog zu
 * src/lib/time/sfn/golden-master.test.ts.
 *
 * Hinweis: Die aktuell hinterlegte Fixture ist eine HANDGERECHNETE
 * Platzhalter-Fixture (siehe README.md). Sie wird ersetzt, sobald der
 * unabhängige Prüfer die echte Fixture aus den Altdaten liefert —
 * Format identisch, Harness läuft ohne Änderung weiter.
 */

import { describe, expect, it } from "vitest";
import fixture from "./cashBalance.json";
import { accumulateChain, type DayInput } from "../cash-ledger";
import { calcWaiterSettlement } from "../waiter-settlement";

type Fixture = {
  meta: { source: string; kitchenTipRate: number; note?: string };
  openingBalanceCents: number;
  days: Array<
    DayInput & {
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
        deltaCents: number;
        balanceCents: number;
        deficitCarriedFromPreviousCents: number;
      };
    }
  >;
};

const fx = fixture as Fixture;

describe(`Golden Master: cashBalance (${fx.meta.source})`, () => {
  it("Fixture hat ein nicht-leeres days[]", () => {
    expect(fx.days.length).toBeGreaterThan(0);
  });

  it("Tages-Saldo-Kette reproduziert sich cent-genau", () => {
    const result = accumulateChain(
      fx.openingBalanceCents,
      fx.days.map((d) => ({
        businessDate: d.businessDate,
        grossRevenueCents: d.grossRevenueCents,
        vouchersSoldCents: d.vouchersSoldCents,
        vouchersRedeemedCents: d.vouchersRedeemedCents,
        finedineVouchersCents: d.finedineVouchersCents,
        satellites: d.satellites,
      })),
    );
    const expected = fx.days.map((d) => ({
      businessDate: d.businessDate,
      deltaCents: d.expected.deltaCents,
      balanceCents: d.expected.balanceCents,
      deficitCarriedFromPreviousCents: d.expected.deficitCarriedFromPreviousCents,
    }));
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
