import { describe, it, expect } from "vitest";
import { groupMyShiftsByDate, type MyShiftRow } from "./my-shifts";

function row(date: string, area: MyShiftRow["area"] = "service", loc = "Hauptlokal"): MyShiftRow {
  return {
    shiftId: `${date}-${area}-${loc}`,
    shift_date: date,
    locationName: loc,
    area,
    skillCode: null,
    skillLabel: null,
    status: "planned",
    notes: null,
  };
}

describe("groupMyShiftsByDate", () => {
  it("returns [] for an empty list", () => {
    expect(groupMyShiftsByDate([])).toEqual([]);
  });

  it("groups several days in input order", () => {
    const rows = [row("2026-06-17"), row("2026-06-18"), row("2026-06-19")];
    const out = groupMyShiftsByDate(rows);
    expect(out.map((d) => d.date)).toEqual(["2026-06-17", "2026-06-18", "2026-06-19"]);
    expect(out.every((d) => d.shifts.length === 1)).toBe(true);
  });

  it("places multiple shifts on the same date into the same bucket", () => {
    const rows = [
      row("2026-06-17", "kitchen"),
      row("2026-06-17", "service"),
      row("2026-06-18", "service"),
    ];
    const out = groupMyShiftsByDate(rows);
    expect(out).toHaveLength(2);
    expect(out[0].date).toBe("2026-06-17");
    expect(out[0].shifts.map((s) => s.area)).toEqual(["kitchen", "service"]);
    expect(out[1].shifts).toHaveLength(1);
  });
});
