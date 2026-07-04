import { describe, expect, it } from "vitest";
import {
  computeProvisionPool,
  distributeProvision,
  type ProvisionDayInput,
  type ProvisionSettings,
} from "./provision-calc";

const settings: ProvisionSettings = { minRevenueCents: 120000, pct: 5 };
const noGl = new Set<string>();

describe("computeProvisionPool — Legacy-Kanonik", () => {
  it("1 Tag, 2 Kellner, 3.400 € / min 1.200 € / 5 % ⇒ Pool 5.000 Cents", () => {
    const days: ProvisionDayInput[] = [
      {
        businessDate: "2026-04-01",
        settlements: [
          { staffId: "a", posSalesCents: 200000, partnerStaffIds: [] },
          { staffId: "b", posSalesCents: 140000, partnerStaffIds: [] },
        ],
      },
    ];
    const res = computeProvisionPool(days, settings, noGl);
    expect(res.poolCents).toBe(5000);
    expect(res.dayBreakdown).toEqual([
      {
        businessDate: "2026-04-01",
        waiterCount: 2,
        revenueCents: 340000,
        thresholdCents: 240000,
        dayPoolCents: 5000,
      },
    ]);
  });

  it("Schwelle knapp verfehlt: Durchschnitt < min ⇒ Tages-Pool 0, auch wenn ein Einzelner drüber liegt", () => {
    const days: ProvisionDayInput[] = [
      {
        businessDate: "2026-04-02",
        settlements: [
          { staffId: "a", posSalesCents: 150000, partnerStaffIds: [] },
          { staffId: "b", posSalesCents: 80000, partnerStaffIds: [] },
        ],
      },
    ];
    // Ø 115.000 < 120.000
    expect(computeProvisionPool(days, settings, noGl).poolCents).toBe(0);
  });

  it("Partner erhöhen die Kellnerzahl und können den Tag unter die Schwelle drücken", () => {
    const days: ProvisionDayInput[] = [
      {
        businessDate: "2026-04-03",
        settlements: [{ staffId: "a", posSalesCents: 230000, partnerStaffIds: ["b"] }],
      },
    ];
    // Ohne Partner wäre Ø 230.000 > 120.000; mit Partner Ø 115.000 → 0.
    expect(computeProvisionPool(days, settings, noGl).poolCents).toBe(0);
  });

  it("GL wird als Haupt-Kellner UND als Partner ignoriert (Umsatz + Kopfzahl)", () => {
    const gl = new Set<string>(["gl1"]);
    const days: ProvisionDayInput[] = [
      {
        businessDate: "2026-04-04",
        settlements: [
          { staffId: "a", posSalesCents: 200000, partnerStaffIds: ["gl1"] },
          { staffId: "b", posSalesCents: 140000, partnerStaffIds: [] },
          { staffId: "gl1", posSalesCents: 500000, partnerStaffIds: [] },
        ],
      },
    ];
    const res = computeProvisionPool(days, settings, gl);
    // Ohne GL: revenue = 340.000, waiter = {a,b} = 2, gleicher Fall wie Kanonik
    expect(res.poolCents).toBe(5000);
    expect(res.dayBreakdown[0].waiterCount).toBe(2);
    expect(res.dayBreakdown[0].revenueCents).toBe(340000);
  });

  it("mehrere Tage werden summiert", () => {
    const days: ProvisionDayInput[] = [
      {
        businessDate: "2026-04-05",
        settlements: [
          { staffId: "a", posSalesCents: 200000, partnerStaffIds: [] },
          { staffId: "b", posSalesCents: 140000, partnerStaffIds: [] },
        ],
      },
      {
        businessDate: "2026-04-06",
        settlements: [
          { staffId: "a", posSalesCents: 150000, partnerStaffIds: [] },
          { staffId: "b", posSalesCents: 80000, partnerStaffIds: [] },
        ],
      },
    ];
    expect(computeProvisionPool(days, settings, noGl).poolCents).toBe(5000);
  });
});

describe("distributeProvision — Largest-Remainder", () => {
  it("Pool 10001 auf 3 gleiche Stundenblöcke ⇒ Summe exakt 10001, deterministisch", () => {
    const dist = distributeProvision(10001, [
      { staffId: "b", minutes: 60 },
      { staffId: "c", minutes: 60 },
      { staffId: "a", minutes: 60 },
    ]);
    const values = Array.from(dist.values());
    expect(values.reduce((s, v) => s + v, 0)).toBe(10001);
    // Bei Tie geht der eine Rest-Cent an den kleinsten staffId ("a").
    expect(dist.get("a")).toBe(3334);
    expect(dist.get("b")).toBe(3334);
    expect(dist.get("c")).toBe(3333);
    // Reihenfolge der Input-Liste darf das Ergebnis nicht ändern.
    const dist2 = distributeProvision(10001, [
      { staffId: "a", minutes: 60 },
      { staffId: "b", minutes: 60 },
      { staffId: "c", minutes: 60 },
    ]);
    expect(dist2.get("a")).toBe(dist.get("a"));
    expect(dist2.get("b")).toBe(dist.get("b"));
    expect(dist2.get("c")).toBe(dist.get("c"));
  });

  it("leere Stunden ⇒ leere Verteilung", () => {
    expect(distributeProvision(5000, []).size).toBe(0);
    expect(distributeProvision(5000, [{ staffId: "a", minutes: 0 }]).size).toBe(0);
  });

  it("Pool ≤ 0 ⇒ leere Verteilung", () => {
    expect(distributeProvision(0, [{ staffId: "a", minutes: 60 }]).size).toBe(0);
    expect(distributeProvision(-5, [{ staffId: "a", minutes: 60 }]).size).toBe(0);
  });

  it("proportionale Verteilung (kein Rest)", () => {
    const dist = distributeProvision(1000, [
      { staffId: "a", minutes: 60 },
      { staffId: "b", minutes: 40 },
    ]);
    expect(dist.get("a")).toBe(600);
    expect(dist.get("b")).toBe(400);
  });
});
