import { describe, it, expect } from "vitest";
import {
  classifyCrossBookings,
  indexClassifiedByStaffDate,
  worstKind,
  type CrossBookingRow,
} from "./cross-booking";
import { computeCrossBookingFlags, type ShiftForFlag } from "./cross-booking";

function row(
  o: Partial<CrossBookingRow> & {
    staffId: string;
    locationId: string;
    area?: CrossBookingRow["area"];
  },
): CrossBookingRow {
  return {
    staffId: o.staffId,
    shiftDate: o.shiftDate ?? "2026-07-10",
    locationId: o.locationId,
    locationName: o.locationName ?? "Loc",
    area: o.area ?? "service",
    servicePeriod: o.servicePeriod ?? "abend",
    skillName: o.skillName ?? null,
  };
}

describe("classifyCrossBookings", () => {
  it("behandelt Standard-Standorte (alle 'abend') wie vor SP1: jede Fremdbuchung ist ein Konflikt", () => {
    const rows = [
      row({ staffId: "s1", locationId: "L_OTHER", area: "service" }),
      row({ staffId: "s1", locationId: "L_OTHER", area: "kitchen" }),
    ];
    const out = classifyCrossBookings(rows, {
      locationId: "L_HOME",
      area: "service",
      servicePeriod: "abend",
    });
    expect(out).toHaveLength(2);
    expect(out.every((r) => r.kind === "conflict")).toBe(true);
  });

  it("ignoriert Buchungen im aktiven Grid selbst", () => {
    const rows = [
      row({ staffId: "s1", locationId: "L_HOME", area: "service", servicePeriod: "abend" }),
    ];
    const out = classifyCrossBookings(rows, {
      locationId: "L_HOME",
      area: "service",
      servicePeriod: "abend",
    });
    expect(out).toHaveLength(0);
  });

  it("Tagesbetrieb: Fremdbuchung im gleichen Fenster = Konflikt", () => {
    const rows = [
      row({ staffId: "s1", locationId: "L_OTHER", area: "service", servicePeriod: "mittag" }),
    ];
    const out = classifyCrossBookings(rows, {
      locationId: "L_HOME",
      area: "service",
      servicePeriod: "mittag",
    });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("conflict");
  });

  it("Tagesbetrieb: Fremdbuchung im anderen Fenster = Info (Doppelschicht ok)", () => {
    const rows = [
      row({ staffId: "s1", locationId: "L_OTHER", area: "service", servicePeriod: "abend" }),
    ];
    const out = classifyCrossBookings(rows, {
      locationId: "L_HOME",
      area: "service",
      servicePeriod: "mittag",
    });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("info");
  });

  it("mehrere Fremdbuchungen mit gemischten Fenstern werden je nach Fenster klassifiziert", () => {
    const rows = [
      row({ staffId: "s1", locationId: "L_A", servicePeriod: "mittag" }),
      row({ staffId: "s1", locationId: "L_B", servicePeriod: "abend" }),
      row({ staffId: "s1", locationId: "L_C", servicePeriod: "abend" }),
    ];
    const out = classifyCrossBookings(rows, {
      locationId: "L_HOME",
      area: "service",
      servicePeriod: "abend",
    });
    const kinds = out.map((r) => `${r.locationId}:${r.kind}`).sort();
    expect(kinds).toEqual(["L_A:info", "L_B:conflict", "L_C:conflict"]);
  });

  it("SP2: Früh vs. Abend am selben Tag → info (Doppelschicht ok)", () => {
    const rows = [
      row({ staffId: "s1", locationId: "L_OTHER", area: "service", servicePeriod: "frueh" }),
    ];
    const out = classifyCrossBookings(rows, {
      locationId: "L_HOME",
      area: "service",
      servicePeriod: "abend",
    });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("info");
  });

  it("SP2: Früh vs. Früh woanders → conflict", () => {
    const rows = [
      row({ staffId: "s1", locationId: "L_OTHER", area: "service", servicePeriod: "frueh" }),
    ];
    const out = classifyCrossBookings(rows, {
      locationId: "L_HOME",
      area: "service",
      servicePeriod: "frueh",
    });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("conflict");
  });

  it("SP2: Früh + Mittag + Abend am selben Tag ergeben zwei Infos aus Sicht Abend", () => {
    const rows = [
      row({ staffId: "s1", locationId: "L_A", servicePeriod: "frueh" }),
      row({ staffId: "s1", locationId: "L_B", servicePeriod: "mittag" }),
    ];
    const out = classifyCrossBookings(rows, {
      locationId: "L_HOME",
      area: "service",
      servicePeriod: "abend",
    });
    expect(out.map((r) => r.kind).sort()).toEqual(["info", "info"]);
  });
});

describe("indexClassifiedByStaffDate + worstKind", () => {
  it("gruppiert und wählt den schlimmsten Kind", () => {
    const rows = [
      row({ staffId: "s1", locationId: "L_A", servicePeriod: "mittag" }),
      row({ staffId: "s1", locationId: "L_B", servicePeriod: "abend" }),
    ];
    const classified = classifyCrossBookings(rows, {
      locationId: "L_HOME",
      area: "service",
      servicePeriod: "abend",
    });
    const idx = indexClassifiedByStaffDate(classified);
    const bucket = idx.get("s1|2026-07-10") ?? [];
    expect(bucket).toHaveLength(2);
    expect(worstKind(bucket)).toBe("conflict");
  });

  it("worstKind liefert null bei leerer Menge", () => {
    expect(worstKind([])).toBeNull();
  });
});

describe("computeCrossBookingFlags (DP1)", () => {
  const base: Omit<ShiftForFlag, "locationId" | "area"> = {
    staffId: "s1",
    shiftDate: "2026-07-21",
  };
  const viewport = { locationId: "L_HOME", area: "service" as const };

  it("(a) Schicht am gleichen Standort/Bereich → kein Flag", () => {
    const flags = computeCrossBookingFlags(
      [{ ...base, locationId: "L_HOME", area: "service" }],
      viewport,
    );
    expect(flags.size).toBe(0);
  });

  it("(b) Schicht an anderem Standort → Flag", () => {
    const flags = computeCrossBookingFlags(
      [{ ...base, locationId: "L_OTHER", area: "service" }],
      viewport,
    );
    expect(flags.has("s1|2026-07-21")).toBe(true);
  });

  it("(c) anderer Bereich, gleicher Standort → Flag", () => {
    const flags = computeCrossBookingFlags(
      [{ ...base, locationId: "L_HOME", area: "kitchen" }],
      viewport,
    );
    expect(flags.has("s1|2026-07-21")).toBe(true);
  });

  it("(d) keine Schicht → kein Flag", () => {
    const flags = computeCrossBookingFlags([], viewport);
    expect(flags.size).toBe(0);
  });

  it("mehrere MA/Tage werden korrekt zusammengeführt", () => {
    const flags = computeCrossBookingFlags(
      [
        { staffId: "s1", shiftDate: "2026-07-21", locationId: "L_OTHER", area: "service" },
        { staffId: "s2", shiftDate: "2026-07-22", locationId: "L_HOME", area: "kitchen" },
        { staffId: "s3", shiftDate: "2026-07-21", locationId: "L_HOME", area: "service" }, // gleich → ignoriert
      ],
      viewport,
    );
    expect(flags.size).toBe(2);
    expect(flags.has("s1|2026-07-21")).toBe(true);
    expect(flags.has("s2|2026-07-22")).toBe(true);
    expect(flags.has("s3|2026-07-21")).toBe(false);
  });
});
