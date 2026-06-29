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
    expect(totals.totalCents).toBe(0);
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
});
