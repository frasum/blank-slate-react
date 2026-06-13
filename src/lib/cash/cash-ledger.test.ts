import { describe, expect, it } from "vitest";
import {
  accumulateChain,
  computeDailyCash,
  computeTransferEffect,
  effectiveVorschussCents,
  type DayInput,
} from "./cash-ledger";

function emptyDay(over: Partial<DayInput> = {}): DayInput {
  return {
    businessDate: "2026-06-01",
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
    ...over,
  };
}

describe("computeDailyCash — Alt-Modell-Formel (Befund 2)", () => {
  it("POS-only: dailyCash = grossRevenue", () => {
    expect(computeDailyCash(emptyDay({ grossRevenueCents: 1000_00 }))).toBe(100_000);
  });

  it("cardTotal wird subtrahiert (Karten kommen nicht in die Kasse)", () => {
    expect(
      computeDailyCash(emptyDay({ grossRevenueCents: 1000_00, cardTotalCents: 600_00 })),
    ).toBe(40_000);
  });

  it("Karten dominieren → dailyCash negativ", () => {
    expect(computeDailyCash(emptyDay({ grossRevenueCents: 100_00, cardTotalCents: 250_00 }))).toBe(
      -15_000,
    );
  });

  it("Wolt + SOUSE werden subtrahiert", () => {
    expect(
      computeDailyCash(
        emptyDay({
          grossRevenueCents: 500_00,
          deliverySouseCents: 80_00,
          deliveryWoltCents: 30_00,
        }),
      ),
    ).toBe(390_00);
  });

  it("Gutscheine: Verkauf +, Einlösung −, FineDine −", () => {
    expect(
      computeDailyCash(
        emptyDay({
          grossRevenueCents: 200_00,
          vouchersSoldCents: 50_00,
          vouchersRedeemedCents: 30_00,
          finedineVouchersCents: 15_00,
        }),
      ),
    ).toBe(205_00);
  });

  it("einladung, openInvoices und sonstigeEinnahme", () => {
    expect(
      computeDailyCash(
        emptyDay({
          grossRevenueCents: 500_00,
          einladungCents: 25_00,
          openInvoicesCents: [10_00, 5_00],
          sonstigeEinnahmeCents: 8_00,
        }),
      ),
    ).toBe(500_00 - 25_00 - 15_00 + 8_00);
  });

  it("cardTransactions wird IGNORIERT (Alt-Modell hat das nie)", () => {
    const base = emptyDay({ grossRevenueCents: 100_00 });
    const withCardTx = emptyDay({
      grossRevenueCents: 100_00,
      satellites: { ...base.satellites, cardTransactionsCents: [50_00, -10_00] },
    });
    expect(computeDailyCash(withCardTx)).toBe(computeDailyCash(base));
  });

  describe("Vorschuss-Quirk: advances-Liste ODER vorschussCents — niemals beides", () => {
    it("nur vorschussCents (Liste leer) → Pauschalfeld gilt", () => {
      const d = emptyDay({ grossRevenueCents: 200_00, vorschussCents: 50_00 });
      expect(effectiveVorschussCents(d)).toBe(50_00);
      expect(computeDailyCash(d)).toBe(150_00);
    });
    it("advances nicht leer → Liste gilt, vorschussCents wird ignoriert", () => {
      const d = emptyDay({
        grossRevenueCents: 200_00,
        vorschussCents: 999_00, // wird ignoriert
        satellites: {
          expensesCents: [],
          advancesCents: [20_00, 10_00],
          cardTransactionsCents: [],
          bankDepositsCents: [],
          registerTransfers: [],
        },
      });
      expect(effectiveVorschussCents(d)).toBe(30_00);
      expect(computeDailyCash(d)).toBe(170_00);
    });
  });
});

describe("computeTransferEffect", () => {
  it("to_restaurant addiert, to_safe / to_other / from_restaurant subtrahieren", () => {
    const d = emptyDay({
      satellites: {
        expensesCents: [],
        advancesCents: [],
        cardTransactionsCents: [],
        bankDepositsCents: [],
        registerTransfers: [
          { direction: "to_restaurant", amountCents: 100_00 },
          { direction: "to_safe", amountCents: 30_00 },
          { direction: "to_other", amountCents: 20_00 },
          { direction: "from_restaurant", amountCents: 10_00 }, // Legacy = outflow
        ],
      },
    });
    expect(computeTransferEffect(d)).toBe(100_00 - 30_00 - 20_00 - 10_00);
  });
});

describe("accumulateChain — Mehrtages-Kette mit Bankeinzahlung NACH Carry", () => {
  it("Einzahlung > rawBargeld + carry → negativer Carry für Folgetag", () => {
    const out = accumulateChain(0, [
      emptyDay({
        businessDate: "2026-06-01",
        grossRevenueCents: 100_00,
        satellites: {
          expensesCents: [],
          advancesCents: [],
          cardTransactionsCents: [],
          bankDepositsCents: [300_00], // mehr eingezahlt als drin war
          registerTransfers: [],
        },
      }),
      emptyDay({
        businessDate: "2026-06-02",
        grossRevenueCents: 500_00,
      }),
    ]);
    expect(out[0].rawBargeldCents).toBe(100_00);
    expect(out[0].chainedCents).toBe(100_00);
    expect(out[0].bankDepositsTotalCents).toBe(300_00);
    expect(out[0].remainingCashCents).toBe(-200_00);
    expect(out[0].balanceCents).toBe(-200_00);
    expect(out[1].previousCarryCents).toBe(-200_00);
    expect(out[1].deficitCarriedFromPreviousCents).toBe(200_00);
    expect(out[1].chainedCents).toBe(500_00 - 200_00);
    expect(out[1].balanceCents).toBe(300_00);
  });

  it("Defizit-Übertrag bleibt sichtbar über mehrere Tage", () => {
    const out = accumulateChain(50_00, [
      emptyDay({ businessDate: "2026-06-01", grossRevenueCents: 100_00 }),
      emptyDay({ businessDate: "2026-06-02", grossRevenueCents: 200_00 }),
    ]);
    expect(out[0].balanceCents).toBe(150_00);
    expect(out[1].previousCarryCents).toBe(150_00);
    expect(out[1].balanceCents).toBe(350_00);
  });

  it("Verweigert nicht-aufsteigende Tagesreihenfolge", () => {
    expect(() =>
      accumulateChain(0, [
        emptyDay({ businessDate: "2026-06-02" }),
        emptyDay({ businessDate: "2026-06-01" }),
      ]),
    ).toThrow(/strictly ascending/);
  });
});