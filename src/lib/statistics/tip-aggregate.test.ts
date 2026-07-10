import { describe, expect, it } from "vitest";
import { aggregateTips, type SessionTipResult } from "./tip-aggregate";

describe("aggregateTips", () => {
  it("zwei Sessions am selben Tag → eine daily-Zeile mit Summe", () => {
    const results: SessionTipResult[] = [
      {
        businessDate: "2026-06-10",
        serviceRemainderCents: 50,
        kitchenRemainderCents: 20,
        shares: [],
      },
      {
        businessDate: "2026-06-10",
        serviceRemainderCents: 30,
        kitchenRemainderCents: 10,
        shares: [],
      },
    ];
    const { daily, totals } = aggregateTips(results, {});
    expect(daily).toEqual([{ businessDate: "2026-06-10", serviceCents: 80, kitchenCents: 30 }]);
    expect(totals).toEqual({ serviceCents: 80, kitchenCents: 30, totalCents: 110 });
  });

  it("daily aufsteigend sortiert", () => {
    const results: SessionTipResult[] = [
      {
        businessDate: "2026-06-12",
        serviceRemainderCents: 0,
        kitchenRemainderCents: 0,
        shares: [],
      },
      {
        businessDate: "2026-06-10",
        serviceRemainderCents: 0,
        kitchenRemainderCents: 0,
        shares: [],
      },
      {
        businessDate: "2026-06-11",
        serviceRemainderCents: 0,
        kitchenRemainderCents: 0,
        shares: [],
      },
    ];
    const { daily } = aggregateTips(results, {});
    expect(daily.map((d) => d.businessDate)).toEqual(["2026-06-10", "2026-06-11", "2026-06-12"]);
  });

  it("Person in mehreren Sessions → ein perStaff-Eintrag mit Summe", () => {
    const results: SessionTipResult[] = [
      {
        businessDate: "2026-06-10",
        serviceRemainderCents: 0,
        kitchenRemainderCents: 0,
        shares: [
          { staffId: "a", department: "service", shareCents: 1500 },
          { staffId: "b", department: "kitchen", shareCents: 500 },
        ],
      },
      {
        businessDate: "2026-06-11",
        serviceRemainderCents: 0,
        kitchenRemainderCents: 0,
        shares: [{ staffId: "a", department: "service", shareCents: 700 }],
      },
    ];
    const { perStaff, totals } = aggregateTips(results, { a: "Alice", b: "Bob" });
    expect(perStaff).toEqual([
      { staffId: "a", department: "service", tipCents: 2200, name: "Alice" },
      { staffId: "b", department: "kitchen", tipCents: 500, name: "Bob" },
    ]);
    // STAT-U3-Fix: verteilte Shares zählen jetzt zu totals/daily.
    expect(totals).toEqual({ serviceCents: 2200, kitchenCents: 500, totalCents: 2700 });
  });

  it("perStaff Sortierung absteigend nach Betrag, Fallback-Name = staffId", () => {
    const results: SessionTipResult[] = [
      {
        businessDate: "2026-06-10",
        serviceRemainderCents: 0,
        kitchenRemainderCents: 0,
        shares: [
          { staffId: "low", department: "service", shareCents: 100 },
          { staffId: "high", department: "service", shareCents: 9999 },
          { staffId: "mid", department: "kitchen", shareCents: 500 },
        ],
      },
    ];
    const { perStaff } = aggregateTips(results, { high: "H" });
    expect(perStaff.map((p) => p.staffId)).toEqual(["high", "mid", "low"]);
    expect(perStaff.find((p) => p.staffId === "mid")?.name).toBe("mid");
  });

  it("totalCents = service + kitchen", () => {
    const results: SessionTipResult[] = [
      {
        businessDate: "2026-06-10",
        serviceRemainderCents: 123,
        kitchenRemainderCents: 456,
        shares: [],
      },
    ];
    const { totals } = aggregateTips(results, {});
    expect(totals.totalCents).toBe(totals.serviceCents + totals.kitchenCents);
    expect(totals.totalCents).toBe(579);
  });

  it("leere Eingabe → leere Aggregate", () => {
    const { daily, totals, perStaff } = aggregateTips([], {});
    expect(daily).toEqual([]);
    expect(perStaff).toEqual([]);
    expect(totals).toEqual({ serviceCents: 0, kitchenCents: 0, totalCents: 0 });
  });

  // STAT-U3-Regression: Ein Standort verteilt alles (Remainder=0), ein anderer
  // hält den Pool. Zuvor wurde nur der Rest gezählt — der verteilende Standort
  // sah dann fälschlich fast 0 € Trinkgeld aus. Jetzt muss beides gleich viel
  // Trinkgeld ergeben, wenn Shares+Remainder gleich sind.
  it("verteilende Standorte werden nicht mehr unterbewertet", () => {
    const verteilend: SessionTipResult = {
      businessDate: "2026-06-10",
      serviceRemainderCents: 10,
      kitchenRemainderCents: 0,
      shares: [
        { staffId: "s1", department: "service", shareCents: 15000 },
        { staffId: "k1", department: "kitchen", shareCents: 5000 },
      ],
    };
    const poolend: SessionTipResult = {
      businessDate: "2026-06-10",
      serviceRemainderCents: 15010,
      kitchenRemainderCents: 5000,
      shares: [],
    };
    const a = aggregateTips([verteilend], {}).totals;
    const b = aggregateTips([poolend], {}).totals;
    expect(a).toEqual(b);
    expect(a.totalCents).toBe(20010);
  });

  it("totals = Σ shares + Σ remainders (Invariante)", () => {
    const results: SessionTipResult[] = [
      {
        businessDate: "2026-06-10",
        serviceRemainderCents: 30,
        kitchenRemainderCents: 20,
        shares: [
          { staffId: "a", department: "service", shareCents: 1000 },
          { staffId: "b", department: "kitchen", shareCents: 400 },
        ],
      },
    ];
    const { totals, perStaff } = aggregateTips(results, {});
    const staffSum = perStaff.reduce((s, p) => s + p.tipCents, 0);
    expect(totals.totalCents).toBe(staffSum + 30 + 20);
  });
});
