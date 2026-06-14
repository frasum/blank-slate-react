// Schutz gegen abgeschnittene/falsche Alt-Restaurant-IDs in
// ALT_LOCATION_MAP. Quelle: tagesabrechnung-CSV (verifizierte Grundlage).
import { describe, it, expect } from "vitest";
import { ALT_LOCATION_MAP } from "./import-assignments-core";
import { computeAssignmentPlan, type AssignmentInput } from "./import-assignments";

const ALT_SPICERY = "a1710390-ea4d-4bc2-b869-c0c047056b15";
const ALT_YUM = "3065f458-6d66-4a5d-a85e-f8ee33bb7351";
const COCO_SPICERY = "44a99e7e-93be-44b1-89ab-38e364a02ddc";
const COCO_YUM = "14c2d773-6c5f-4a24-ba00-1c726f277091";

describe("ALT_LOCATION_MAP", () => {
  it("enthält die echten Alt-UUIDs aus der tagesabrechnung-CSV", () => {
    expect(ALT_LOCATION_MAP[ALT_SPICERY]).toBe(COCO_SPICERY);
    expect(ALT_LOCATION_MAP[ALT_YUM]).toBe(COCO_YUM);
  });

  it("keine Schlüssel mit Null-Suffix (Platzhalter-Schutz)", () => {
    for (const k of Object.keys(ALT_LOCATION_MAP)) {
      expect(k).not.toMatch(/-0000-0000-0000-000000000000$/);
    }
  });

  it("Diff erzeugt KEINE unknown_location-Skips für die zwei bekannten Standorte", () => {
    const staffMap = new Map([["alt-x", "staff-x"]]);
    const locationMap = new Map(Object.entries(ALT_LOCATION_MAP));
    const assignments: AssignmentInput[] = [
      { altStaffId: "alt-x", altLocationId: ALT_SPICERY, ztDepartment: "Küche" },
      { altStaffId: "alt-x", altLocationId: ALT_YUM, ztDepartment: "Küche" },
    ];
    const r = computeAssignmentPlan({
      assignments,
      skills: [],
      staffMap,
      locationMap,
      skillMap: new Map(),
      currentLocations: [],
      currentSkills: [],
      skillsMode: "replace",
    });
    expect(r.skippedRows.filter((s) => s.reason === "unknown_location")).toEqual([]);
    expect(r.totals.locationsAdded).toBe(2);
  });
});
