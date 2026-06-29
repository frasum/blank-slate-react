import { describe, expect, it } from "vitest";
import {
  aggregatePersonnel,
  laborCostCents,
  personnelRatioPct,
  selectHourlyRateEur,
  type CompRow,
  type WorkEntry,
} from "./personnel-core";

describe("selectHourlyRateEur", () => {
  const rows: CompRow[] = [
    { validFrom: "2025-01-01", hourlyRateEur: 12 },
    { validFrom: "2026-01-01", hourlyRateEur: 13.5 },
    { validFrom: "2026-06-15", hourlyRateEur: 14 },
  ];

  it("wählt den jüngsten gültigen Satz", () => {
    expect(selectHourlyRateEur(rows, "2026-06-20")).toBe(14);
    expect(selectHourlyRateEur(rows, "2026-06-14")).toBe(13.5);
    expect(selectHourlyRateEur(rows, "2025-12-31")).toBe(12);
  });

  it("validFrom == workDate ist gültig", () => {
    expect(selectHourlyRateEur(rows, "2026-06-15")).toBe(14);
  });

  it("keiner gültig → null", () => {
    expect(selectHourlyRateEur(rows, "2024-12-31")).toBeNull();
    expect(selectHourlyRateEur([], "2026-06-15")).toBeNull();
  });
});

describe("laborCostCents", () => {
  it("3,5 h × 13,50 € = 4725 ct", () => {
    expect(laborCostCents(3.5, 13.5)).toBe(4725);
  });

  it("rundet zu ganzen Cents", () => {
    expect(laborCostCents(1.333, 10)).toBe(1333);
    expect(laborCostCents(1 / 3, 10)).toBe(333);
  });
});

describe("aggregatePersonnel", () => {
  const comp: Record<string, CompRow[]> = {
    a: [{ validFrom: "2026-01-01", hourlyRateEur: 15 }],
    b: [{ validFrom: "2026-01-01", hourlyRateEur: 20 }],
    // c hat keinen Eintrag
  };

  it("summiert zwei Einträge eines Staff", () => {
    const entries: WorkEntry[] = [
      { staffId: "a", businessDate: "2026-06-01", netMinutes: 120 }, // 2h
      { staffId: "a", businessDate: "2026-06-02", netMinutes: 90 }, // 1.5h
    ];
    const agg = aggregatePersonnel(entries, comp);
    expect(agg.perStaff).toHaveLength(1);
    expect(agg.perStaff[0].staffId).toBe("a");
    expect(agg.perStaff[0].netHours).toBe(3.5);
    expect(agg.perStaff[0].laborCostCents).toBe(5250); // 3.5 * 15 * 100
    expect(agg.totalNetHours).toBe(3.5);
    expect(agg.totalLaborCostCents).toBe(5250);
    expect(agg.staffWithoutRate).toEqual([]);
  });

  it("Staff ohne gültigen Satz → in staffWithoutRate, Kosten 0, Stunden gezählt", () => {
    const entries: WorkEntry[] = [
      { staffId: "c", businessDate: "2026-06-01", netMinutes: 60 },
      { staffId: "c", businessDate: "2026-06-02", netMinutes: 60 },
    ];
    const agg = aggregatePersonnel(entries, comp);
    expect(agg.staffWithoutRate).toEqual(["c"]);
    expect(agg.perStaff[0].laborCostCents).toBe(0);
    expect(agg.perStaff[0].netHours).toBe(2);
    expect(agg.totalLaborCostCents).toBe(0);
  });

  it("Sortierung perStaff absteigend nach laborCostCents", () => {
    const entries: WorkEntry[] = [
      { staffId: "a", businessDate: "2026-06-01", netMinutes: 60 }, // 1500 ct
      { staffId: "b", businessDate: "2026-06-01", netMinutes: 60 }, // 2000 ct
    ];
    const agg = aggregatePersonnel(entries, comp);
    expect(agg.perStaff.map((p) => p.staffId)).toEqual(["b", "a"]);
  });
});

describe("personnelRatioPct", () => {
  it("normaler Fall", () => {
    expect(personnelRatioPct(30_000, 100_000)).toBe(30);
  });
  it("revenue 0 → null", () => {
    expect(personnelRatioPct(30_000, 0)).toBeNull();
  });
});
