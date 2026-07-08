import { describe, it, expect } from "vitest";
import { buildDayView } from "./day-view";
import type { RosterShift, RosterAbsence } from "@/lib/roster/roster.functions";

function shift(partial: Partial<RosterShift> & { id: string; staffId: string }): RosterShift {
  return {
    id: partial.id,
    staffId: partial.staffId,
    staffName: partial.staffName ?? "Anna",
    locationId: partial.locationId ?? "L1",
    shiftDate: partial.shiftDate ?? "2026-07-08",
    area: partial.area ?? "kitchen",
    skillId: partial.skillId ?? null,
    skillName: partial.skillName ?? null,
    skillColor: partial.skillColor ?? null,
    status: partial.status ?? "confirmed",
    notes: null,
    servicePeriod: partial.servicePeriod ?? "abend",
  };
}

describe("buildDayView", () => {
  const locations = [
    { id: "L1", name: "Alpha" },
    { id: "L2", name: "Beta" },
    { id: "L3", name: "Gamma" },
  ];

  it("gruppiert Standorte und trennt Küche/Service (GL → Service)", () => {
    const shifts = [
      shift({ id: "1", staffId: "s1", staffName: "Anna", area: "kitchen", skillName: "Cook" }),
      shift({
        id: "2",
        staffId: "s2",
        staffName: "Bea",
        area: "service",
        skillName: "Service",
      }),
      shift({ id: "3", staffId: "s3", staffName: "Cem", area: "gl", skillName: "GL" }),
    ];
    const out = buildDayView({
      date: "2026-07-08",
      locations,
      shifts,
      absences: [],
      wishes: [],
    });
    expect(out).toHaveLength(1);
    expect(out[0].locationId).toBe("L1");
    expect(out[0].kitchen.map((e) => e.staffName)).toEqual(["Anna"]);
    expect(out[0].service.map((e) => e.staffName)).toEqual(["Cem", "Bea"]);
    expect(out[0].service.find((e) => e.staffName === "Cem")?.marker).toBe("GL");
    expect(out[0].service.find((e) => e.staffName === "Bea")?.marker).toBe("X");
  });

  it("blendet Standorte ohne Einträge komplett aus", () => {
    const shifts = [shift({ id: "1", staffId: "s1", locationId: "L2", area: "kitchen" })];
    const out = buildDayView({
      date: "2026-07-08",
      locations,
      shifts,
      absences: [],
      wishes: [],
    });
    expect(out.map((g) => g.locationId)).toEqual(["L2"]);
  });

  it("ignoriert Einträge fremder Tage", () => {
    const shifts = [shift({ id: "1", staffId: "s1", shiftDate: "2026-07-07" })];
    const out = buildDayView({
      date: "2026-07-08",
      locations,
      shifts,
      absences: [],
      wishes: [],
    });
    expect(out).toEqual([]);
  });

  it("mappt Urlaub/Krank auf U/K-Badges (nur für den Tag)", () => {
    const shifts = [
      shift({ id: "1", staffId: "s1", staffName: "Anna" }),
      shift({ id: "2", staffId: "s2", staffName: "Bea" }),
    ];
    const absences: RosterAbsence[] = [
      { staffId: "s1", date: "2026-07-08", type: "urlaub" },
      { staffId: "s2", date: "2026-07-09", type: "krank" },
    ];
    const out = buildDayView({
      date: "2026-07-08",
      locations,
      shifts,
      absences,
      wishes: [],
    });
    const kitchen = out[0].kitchen;
    expect(kitchen.find((e) => e.staffName === "Anna")?.absence).toBe("U");
    expect(kitchen.find((e) => e.staffName === "Bea")?.absence).toBeNull();
  });

  it("sortiert nach Skillname, dann Staffname (de)", () => {
    const shifts = [
      shift({ id: "1", staffId: "s1", staffName: "Zoe", skillName: "Cook" }),
      shift({ id: "2", staffId: "s2", staffName: "Anna", skillName: "Cook" }),
      shift({ id: "3", staffId: "s3", staffName: "Ben", skillName: "Bäcker" }),
    ];
    const out = buildDayView({
      date: "2026-07-08",
      locations,
      shifts,
      absences: [],
      wishes: [],
    });
    expect(out[0].kitchen.map((e) => e.staffName)).toEqual(["Ben", "Anna", "Zoe"]);
  });

  it("markiert Freiwünsche für den Tag", () => {
    const shifts = [shift({ id: "1", staffId: "s1" })];
    const out = buildDayView({
      date: "2026-07-08",
      locations,
      shifts,
      absences: [],
      wishes: [{ staffId: "s1", wishDate: "2026-07-08", note: null }],
    });
    expect(out[0].kitchen[0].wish).toBe(true);
  });
});
