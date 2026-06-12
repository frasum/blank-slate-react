import { describe, expect, it } from "vitest";
import { reconcile } from "./reconcile";
import type { NormalizedShift } from "./normalize";

function mk(partial: Partial<NormalizedShift>): NormalizedShift {
  return {
    altSystem: "tagesabrechnung",
    altId: "x",
    altEmployeeId: "e",
    altEmployeeName: "Anna",
    shiftDate: "2026-01-15",
    startedAt: "2026-01-15T16:00:00.000Z",
    endedAt: "2026-01-15T20:30:00.000Z",
    breakMinutes: 0,
    altTotals: {
      totalHours: 4.5,
      eveningHours: 0.5,
      nightHours: 0,
      nightDeepHours: 0,
      sundayHolidayHours: 0,
    },
    skipReason: null,
    ...partial,
  };
}

describe("reconcile", () => {
  it("liefert 0 Differenzen, wenn Alt-Töpfe identisch zur Neu-Rechnung sind", () => {
    // 17:00–21:30 Berlin: total=4.5, evening (20–21:30) = 1.5
    const shift = mk({
      altTotals: {
        totalHours: 4.5,
        eveningHours: 1.5,
        nightHours: 0,
        nightDeepHours: 0,
        sundayHolidayHours: 0,
      },
    });
    const rows = reconcile({
      shifts: [shift],
      staffIdOf: () => "staff-1",
      sundayHolidayOf: () => false,
      localTimes: () => ({ startLocal: "17:00", endLocal: "21:30" }),
      groupBy: "cycle",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].hasDifference).toBe(false);
    expect(rows[0].diff).toEqual({
      totalHours: 0,
      eveningHours: 0,
      nightHours: 0,
      nightDeepHours: 0,
      sundayHolidayHours: 0,
    });
  });

  it("erkennt Differenz, wenn Alt-Topf manuell editiert wurde", () => {
    const shift = mk({
      altTotals: {
        totalHours: 4.5,
        eveningHours: 2.0, // Alt-Wert manipuliert; neu wäre 1.5
        nightHours: 0,
        nightDeepHours: 0,
        sundayHolidayHours: 0,
      },
    });
    const rows = reconcile({
      shifts: [shift],
      staffIdOf: () => "staff-1",
      sundayHolidayOf: () => false,
      localTimes: () => ({ startLocal: "17:00", endLocal: "21:30" }),
      groupBy: "cycle",
    });
    expect(rows[0].hasDifference).toBe(true);
    expect(rows[0].diff.eveningHours).toBe(0.5);
  });

  it("überspringt Skip-Zeilen und unmapped Staff", () => {
    const rows = reconcile({
      shifts: [mk({ skipReason: "absence" }), mk()],
      staffIdOf: () => null, // niemand gemappt
      sundayHolidayOf: () => false,
      localTimes: () => ({ startLocal: "17:00", endLocal: "21:30" }),
      groupBy: "cycle",
    });
    expect(rows).toHaveLength(0);
  });
});