import { describe, expect, it } from "vitest";
import { accumulateChain, computeDayDelta, type DayInput } from "./cash-ledger";

function emptySatellites(): DayInput["satellites"] {
  return {
    expensesCents: [],
    advancesCents: [],
    cardTransactionsCents: [],
    bankDepositsCents: [],
    registerTransfersToCents: [],
    registerTransfersFromCents: [],
  };
}

describe("computeDayDelta", () => {
  it("nur Umsatz, keine Korrekturen → delta = grossRevenue", () => {
    const d = computeDayDelta({
      businessDate: "2026-06-01",
      grossRevenueCents: 1000_00,
      vouchersSoldCents: 0,
      vouchersRedeemedCents: 0,
      finedineVouchersCents: 0,
      satellites: emptySatellites(),
    });
    expect(d).toBe(100_000);
  });

  it("Gutschein-Verkauf erhöht Cash-Delta ohne Umsatz-Effekt", () => {
    const d = computeDayDelta({
      businessDate: "2026-06-01",
      grossRevenueCents: 0,
      vouchersSoldCents: 50_00,
      vouchersRedeemedCents: 0,
      finedineVouchersCents: 0,
      satellites: emptySatellites(),
    });
    expect(d).toBe(5_000);
  });

  it("Gutschein-Einlösung & FineDine mindern Cash-Delta", () => {
    const d = computeDayDelta({
      businessDate: "2026-06-01",
      grossRevenueCents: 200_00,
      vouchersSoldCents: 0,
      vouchersRedeemedCents: 30_00,
      finedineVouchersCents: 15_00,
      satellites: emptySatellites(),
    });
    // 20000 − 3000 − 1500 = 15500
    expect(d).toBe(15_500);
  });

  it("Ausgaben, Vorschüsse, Bank-Einzahlung mindern; Transfer-to addiert, from subtrahiert", () => {
    const d = computeDayDelta({
      businessDate: "2026-06-01",
      grossRevenueCents: 1000_00,
      vouchersSoldCents: 0,
      vouchersRedeemedCents: 0,
      finedineVouchersCents: 0,
      satellites: {
        expensesCents: [25_00, 10_00],
        advancesCents: [100_00],
        cardTransactionsCents: [],
        bankDepositsCents: [500_00],
        registerTransfersToCents: [50_00],
        registerTransfersFromCents: [20_00],
      },
    });
    // 100000 − 3500 − 10000 − 50000 + 5000 − 2000 = 39500
    expect(d).toBe(39_500);
  });
});

describe("accumulateChain", () => {
  it("Carry-over über mehrere Tage", () => {
    const out = accumulateChain(500_00, [
      {
        businessDate: "2026-06-01",
        grossRevenueCents: 100_00,
        vouchersSoldCents: 0,
        vouchersRedeemedCents: 0,
        finedineVouchersCents: 0,
        satellites: emptySatellites(),
      },
      {
        businessDate: "2026-06-02",
        grossRevenueCents: 200_00,
        vouchersSoldCents: 0,
        vouchersRedeemedCents: 0,
        finedineVouchersCents: 0,
        satellites: emptySatellites(),
      },
    ]);
    expect(out).toEqual([
      {
        businessDate: "2026-06-01",
        deltaCents: 10_000,
        balanceCents: 60_000,
        deficitCarriedFromPreviousCents: 0,
      },
      {
        businessDate: "2026-06-02",
        deltaCents: 20_000,
        balanceCents: 80_000,
        deficitCarriedFromPreviousCents: 0,
      },
    ]);
  });

  it("Defizit-Übertrag: negativer Vortagessaldo sichtbar im Folgetag", () => {
    const out = accumulateChain(0, [
      {
        businessDate: "2026-06-01",
        grossRevenueCents: 100_00,
        vouchersSoldCents: 0,
        vouchersRedeemedCents: 0,
        finedineVouchersCents: 0,
        satellites: {
          ...emptySatellites(),
          advancesCents: [300_00], // großer Vorschuss → negativ
        },
      },
      {
        businessDate: "2026-06-02",
        grossRevenueCents: 500_00,
        vouchersSoldCents: 0,
        vouchersRedeemedCents: 0,
        finedineVouchersCents: 0,
        satellites: emptySatellites(),
      },
    ]);
    expect(out[0].balanceCents).toBe(-20_000);
    expect(out[1].deficitCarriedFromPreviousCents).toBe(20_000);
    expect(out[1].balanceCents).toBe(30_000); // -20000 + 50000
  });

  it("Verweigert nicht-aufsteigende Tagesreihenfolge", () => {
    expect(() =>
      accumulateChain(0, [
        {
          businessDate: "2026-06-02",
          grossRevenueCents: 0,
          vouchersSoldCents: 0,
          vouchersRedeemedCents: 0,
          finedineVouchersCents: 0,
          satellites: emptySatellites(),
        },
        {
          businessDate: "2026-06-01",
          grossRevenueCents: 0,
          vouchersSoldCents: 0,
          vouchersRedeemedCents: 0,
          finedineVouchersCents: 0,
          satellites: emptySatellites(),
        },
      ]),
    ).toThrow(/strictly ascending/);
  });

  it("DST-Sprung Europe/Berlin (29.03. → 30.03.) — reine Datums-Kette, keine Stundenarithmetik", () => {
    // Smoke-Test: das Modul nutzt nur ISO-Datumsstrings, kein Date-Objekt.
    // DST kann hier nichts kaputtmachen — der Test dokumentiert das.
    const out = accumulateChain(0, [
      {
        businessDate: "2026-03-28",
        grossRevenueCents: 100,
        vouchersSoldCents: 0,
        vouchersRedeemedCents: 0,
        finedineVouchersCents: 0,
        satellites: emptySatellites(),
      },
      {
        businessDate: "2026-03-29",
        grossRevenueCents: 100,
        vouchersSoldCents: 0,
        vouchersRedeemedCents: 0,
        finedineVouchersCents: 0,
        satellites: emptySatellites(),
      },
      {
        businessDate: "2026-03-30",
        grossRevenueCents: 100,
        vouchersSoldCents: 0,
        vouchersRedeemedCents: 0,
        finedineVouchersCents: 0,
        satellites: emptySatellites(),
      },
    ]);
    expect(out.map((d) => d.balanceCents)).toEqual([100, 200, 300]);
  });
});