import { describe, expect, it } from "vitest";
import { aggregate, cycleKey, isoWeekKey, type ShiftSample } from "./aggregate-by-business-date";

describe("aggregate", () => {
  it("rechnet jede Schicht einzeln und summiert Topfwerte", () => {
    // Zwei Schichten 19:50–20:05 → eveningHours 0.08 je Schicht
    // (siehe Golden-Master). Summe = 0.16, NICHT verschmolzen.
    const shifts: ShiftSample[] = [
      { staffId: "s1", businessDate: "2026-01-15", startLocal: "19:50:00", endLocal: "20:05:00", sundayOrHoliday: false },
      { staffId: "s1", businessDate: "2026-01-15", startLocal: "19:50:00", endLocal: "20:05:00", sundayOrHoliday: false },
    ];
    const out = aggregate(shifts, (s) => s.businessDate);
    expect(out).toHaveLength(1);
    expect(out[0].entryCount).toBe(2);
    expect(out[0].eveningHours).toBe(0.16);
    expect(out[0].totalHours).toBe(0.5);
  });

  it("trennt nach staffId und Bucket", () => {
    const shifts: ShiftSample[] = [
      { staffId: "a", businessDate: "2026-01-15", startLocal: "10:00", endLocal: "12:00", sundayOrHoliday: false },
      { staffId: "b", businessDate: "2026-01-15", startLocal: "10:00", endLocal: "12:00", sundayOrHoliday: false },
    ];
    const out = aggregate(shifts, (s) => s.businessDate);
    expect(out).toHaveLength(2);
  });
});

describe("cycleKey (26.→25.)", () => {
  it("ordnet 25. dem laufenden Monat zu", () => {
    expect(cycleKey("2026-01-25")).toBe("2026-01");
  });
  it("ordnet 26. dem Folgemonat zu", () => {
    expect(cycleKey("2026-01-26")).toBe("2026-02");
  });
  it("rollt Dezember → Januar nächstes Jahr", () => {
    expect(cycleKey("2026-12-30")).toBe("2027-01");
  });
});

describe("isoWeekKey", () => {
  it("liefert ISO-Woche", () => {
    // 2026-01-05 = Montag, KW 2
    expect(isoWeekKey("2026-01-05")).toBe("2026-W02");
  });
});