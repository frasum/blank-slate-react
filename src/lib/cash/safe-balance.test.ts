import { describe, it, expect } from "vitest";
import { computeSafeChain } from "./safe-balance";

const TARGET = 200_000; // 2.000 €

describe("computeSafeChain", () => {
  it("(a) Überschuss: Ist > Soll → surplus, Tresor wächst", () => {
    const res = computeSafeChain(TARGET, [
      {
        businessDate: "2026-01-01",
        cashActualCents: 250_000,
        cashTargetCents: TARGET,
        bankDepositsCents: [],
      },
    ]);
    expect(res[0].surplusCents).toBe(50_000);
    expect(res[0].shortfallCents).toBe(0);
    expect(res[0].safeBalanceCents).toBe(TARGET + 50_000);
  });

  it("(b) Bankeinzahlung reduziert Tresor", () => {
    const res = computeSafeChain(TARGET, [
      {
        businessDate: "2026-01-01",
        cashActualCents: 200_000,
        cashTargetCents: TARGET,
        bankDepositsCents: [30_000, 20_000],
      },
    ]);
    expect(res[0].surplusCents).toBe(0);
    expect(res[0].safeBalanceCents).toBe(TARGET - 50_000);
  });

  it("(c) Fehlbetrag: Ist < Soll → shortfall, Tresor unverändert", () => {
    const res = computeSafeChain(TARGET, [
      {
        businessDate: "2026-01-01",
        cashActualCents: 150_000,
        cashTargetCents: TARGET,
        bankDepositsCents: [],
      },
    ]);
    expect(res[0].surplusCents).toBe(0);
    expect(res[0].shortfallCents).toBe(50_000);
    expect(res[0].safeBalanceCents).toBe(TARGET);
  });

  it("(d) cash_actual = null → surplus/shortfall null, Tresor unverändert", () => {
    const res = computeSafeChain(TARGET, [
      {
        businessDate: "2026-01-01",
        cashActualCents: null,
        cashTargetCents: TARGET,
        bankDepositsCents: [],
      },
    ]);
    expect(res[0].surplusCents).toBeNull();
    expect(res[0].shortfallCents).toBeNull();
    expect(res[0].safeBalanceCents).toBe(TARGET);
  });

  it("(e) Kette über 3 Tage kumuliert korrekt", () => {
    const res = computeSafeChain(TARGET, [
      {
        businessDate: "2026-01-01",
        cashActualCents: 250_000, // +50.000 in Tresor
        cashTargetCents: TARGET,
        bankDepositsCents: [],
      },
      {
        businessDate: "2026-01-02",
        cashActualCents: 230_000, // +30.000
        cashTargetCents: TARGET,
        bankDepositsCents: [40_000], // -40.000
      },
      {
        businessDate: "2026-01-03",
        cashActualCents: 150_000, // Fehlbetrag, kein Tresor-Effekt
        cashTargetCents: TARGET,
        bankDepositsCents: [10_000], // -10.000
      },
    ]);
    expect(res[0].safeBalanceCents).toBe(TARGET + 50_000); // 250.000
    expect(res[1].safeBalanceCents).toBe(TARGET + 50_000 + 30_000 - 40_000); // 240.000
    expect(res[2].shortfallCents).toBe(50_000);
    expect(res[2].safeBalanceCents).toBe(TARGET + 50_000 + 30_000 - 40_000 - 10_000); // 230.000
  });
});