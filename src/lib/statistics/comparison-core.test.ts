import { describe, it, expect } from "vitest";
import { pctDiff, shareOf, pickTopTwoByTotal } from "./comparison-core";

describe("pctDiff", () => {
  it("positiver Trend", () => {
    expect(pctDiff(150, 100)).toBe(50);
  });
  it("negativer Trend", () => {
    expect(pctDiff(80, 100)).toBe(-20);
  });
  it("b=0 → null", () => {
    expect(pctDiff(500, 0)).toBeNull();
  });
  it("a===b → 0", () => {
    expect(pctDiff(100, 100)).toBe(0);
  });
  it("beide 0 → null (kein definierter Prozentwert)", () => {
    expect(pctDiff(0, 0)).toBeNull();
  });
});

describe("shareOf", () => {
  it("Standardaufteilung", () => {
    expect(shareOf(30, 70)).toBeCloseTo(0.3, 10);
  });
  it("gleich → 0.5", () => {
    expect(shareOf(50, 50)).toBe(0.5);
  });
  it("beide 0 → 0.5 (neutral, kein Kollaps)", () => {
    expect(shareOf(0, 0)).toBe(0.5);
  });
  it("a=0, b>0 → 0", () => {
    expect(shareOf(0, 100)).toBe(0);
  });
  it("negative Eingaben werden geklemmt", () => {
    expect(shareOf(-10, 100)).toBe(0);
  });
});

describe("pickTopTwoByTotal", () => {
  it("zwei umsatzstärkste absteigend", () => {
    const rows = [
      { name: "A", totalCents: 100 },
      { name: "B", totalCents: 300 },
      { name: "C", totalCents: 200 },
    ];
    expect(pickTopTwoByTotal(rows)).toEqual([
      { name: "B", totalCents: 300 },
      { name: "C", totalCents: 200 },
    ]);
  });
  it("Gleichstand → Name aufsteigend, deterministisch", () => {
    const rows = [
      { name: "Yum", totalCents: 500 },
      { name: "Spicery", totalCents: 500 },
      { name: "TSB", totalCents: 500 },
    ];
    expect(pickTopTwoByTotal(rows).map((r) => r.name)).toEqual(["Spicery", "TSB"]);
  });
  it("≤ 2 Einträge → Liste unverändert (Kopie)", () => {
    const rows = [{ name: "A", totalCents: 10 }];
    const out = pickTopTwoByTotal(rows);
    expect(out).toEqual(rows);
    expect(out).not.toBe(rows);
  });
});
