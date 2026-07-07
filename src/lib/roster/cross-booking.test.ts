import { describe, it, expect } from "vitest";
import {
  classifyCrossBookings,
  indexClassifiedByStaffDate,
  worstKind,
  type CrossBookingRow,
} from "./cross-booking";

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
