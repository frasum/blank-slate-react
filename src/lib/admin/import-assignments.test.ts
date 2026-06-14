// Unit-Tests für das reine Mapping-/Diff-Modul.
import { describe, it, expect } from "vitest";
import {
  computeAssignmentPlan,
  mapZtDepartment,
  type AssignmentInput,
  type CurrentLocationRow,
  type SkillInput,
} from "./import-assignments";

const STAFF_APPEL = "staff-appel";
const STAFF_CHEF = "staff-chefin";
const LOC_SPICERY = "loc-spicery";
const LOC_YUM = "loc-yum";

function staffMap(): Map<string, string> {
  return new Map([
    ["alt-appel", STAFF_APPEL],
    ["alt-chefin", STAFF_CHEF],
  ]);
}
function locMap(): Map<string, string> {
  return new Map([
    ["alt-spicery", LOC_SPICERY],
    ["alt-yum", LOC_YUM],
  ]);
}
function skillMap(): Map<string, string> {
  return new Map([
    ["VS", "skill-vs"],
    ["PASS", "skill-pass"],
    ["GL", "skill-gl"],
  ]);
}

describe("mapZtDepartment", () => {
  it("mappt Küche/Service/GL korrekt", () => {
    expect(mapZtDepartment("Küche")).toBe("kitchen");
    expect(mapZtDepartment("Service")).toBe("service");
    expect(mapZtDepartment("GL")).toBe("gl");
  });
});

describe("computeAssignmentPlan — Diff & Platzhalter-Schutz", () => {
  it("Mehrfachzuordnung (kitchen an beiden Standorten) erzeugt 2 adds", () => {
    const r = computeAssignmentPlan({
      assignments: [
        { altStaffId: "alt-appel", altLocationId: "alt-spicery", ztDepartment: "Küche" },
        { altStaffId: "alt-appel", altLocationId: "alt-yum", ztDepartment: "Küche" },
      ],
      skills: [],
      staffMap: staffMap(),
      locationMap: locMap(),
      skillMap: skillMap(),
      currentLocations: [],
      currentSkills: [],
      skillsMode: "replace",
    });
    expect(r.totals.locationsAdded).toBe(2);
    expect(r.totals.locationsRemoved).toBe(0);
    expect(r.perStaff[0].locations.added).toHaveLength(2);
    expect(r.perStaff[0].locations.added.every((a) => a.department === "kitchen")).toBe(true);
  });

  it("ersetzt P1-Platzhalter service durch kitchen am SELBEN Standort", () => {
    const current: CurrentLocationRow[] = [
      { staffId: STAFF_APPEL, locationId: LOC_SPICERY, department: "service" },
    ];
    const r = computeAssignmentPlan({
      assignments: [
        { altStaffId: "alt-appel", altLocationId: "alt-spicery", ztDepartment: "Küche" },
      ],
      skills: [],
      staffMap: staffMap(),
      locationMap: locMap(),
      skillMap: skillMap(),
      currentLocations: current,
      currentSkills: [],
      skillsMode: "replace",
    });
    expect(r.totals.locationsAdded).toBe(1);
    expect(r.totals.locationsRemoved).toBe(1);
    expect(r.perStaff[0].locations.added[0]).toEqual({
      locationId: LOC_SPICERY,
      department: "kitchen",
    });
    expect(r.perStaff[0].locations.removed[0]).toEqual({
      locationId: LOC_SPICERY,
      department: "service",
    });
  });

  it("entfernt NIE kitchen/gl auto (Datenverlust-Schutz)", () => {
    const current: CurrentLocationRow[] = [
      // Ist: kitchen an YUM. Soll: nur kitchen an Spicery → YUM bleibt stehen.
      { staffId: STAFF_APPEL, locationId: LOC_YUM, department: "kitchen" },
    ];
    const r = computeAssignmentPlan({
      assignments: [
        { altStaffId: "alt-appel", altLocationId: "alt-spicery", ztDepartment: "Küche" },
      ],
      skills: [],
      staffMap: staffMap(),
      locationMap: locMap(),
      skillMap: skillMap(),
      currentLocations: current,
      currentSkills: [],
      skillsMode: "replace",
    });
    expect(r.totals.locationsAdded).toBe(1);
    expect(r.totals.locationsRemoved).toBe(0);
  });

  it("Idempotenz: zweiter Lauf nach Commit liefert 0 Ops", () => {
    const current: CurrentLocationRow[] = [
      { staffId: STAFF_APPEL, locationId: LOC_SPICERY, department: "kitchen" },
    ];
    const r = computeAssignmentPlan({
      assignments: [
        { altStaffId: "alt-appel", altLocationId: "alt-spicery", ztDepartment: "Küche" },
      ],
      skills: [{ altStaffId: "alt-appel", skillName: "VS" }],
      staffMap: staffMap(),
      locationMap: locMap(),
      skillMap: skillMap(),
      currentLocations: current,
      currentSkills: [{ staffId: STAFF_APPEL, skillId: "skill-vs" }],
      skillsMode: "replace",
    });
    expect(r.totals.locationsAdded).toBe(0);
    expect(r.totals.locationsRemoved).toBe(0);
    expect(r.totals.skillsAdded).toBe(0);
    expect(r.totals.skillsRemoved).toBe(0);
  });

  it("klassifiziert skippedRows in 3 Gründe", () => {
    const r = computeAssignmentPlan({
      assignments: [
        { altStaffId: "alt-unknown", altLocationId: "alt-spicery", ztDepartment: "Küche" },
        { altStaffId: "alt-appel", altLocationId: "alt-unknown-loc", ztDepartment: "Küche" },
      ],
      skills: [{ altStaffId: "alt-appel", skillName: "UNBEKANNT" }],
      staffMap: staffMap(),
      locationMap: locMap(),
      skillMap: skillMap(),
      currentLocations: [],
      currentSkills: [],
      skillsMode: "replace",
    });
    const reasons = r.skippedRows.map((x) => x.reason).sort();
    expect(reasons).toEqual(["unknown_alt_staff", "unknown_location", "unknown_skill"]);
  });

  it("skillsMode='merge' entfernt keine bestehenden Skills", () => {
    const r = computeAssignmentPlan({
      assignments: [
        { altStaffId: "alt-appel", altLocationId: "alt-spicery", ztDepartment: "Küche" },
      ],
      skills: [{ altStaffId: "alt-appel", skillName: "VS" }],
      staffMap: staffMap(),
      locationMap: locMap(),
      skillMap: skillMap(),
      currentLocations: [],
      currentSkills: [{ staffId: STAFF_APPEL, skillId: "skill-pass" }],
      skillsMode: "merge",
    });
    expect(r.totals.skillsAdded).toBe(1);
    expect(r.totals.skillsRemoved).toBe(0);
  });

  it("GL-Mitarbeiter bekommt department='gl'", () => {
    const r = computeAssignmentPlan({
      assignments: [
        { altStaffId: "alt-chefin", altLocationId: "alt-spicery", ztDepartment: "GL" },
      ],
      skills: [] as SkillInput[],
      staffMap: staffMap(),
      locationMap: locMap(),
      skillMap: skillMap(),
      currentLocations: [],
      currentSkills: [],
      skillsMode: "replace",
    });
    expect(r.perStaff[0].locations.added[0].department).toBe("gl");
  });

  it("nicht-betroffene Mitarbeiter werden ignoriert (currentLocations)", () => {
    const current: CurrentLocationRow[] = [
      { staffId: "other-staff", locationId: LOC_SPICERY, department: "service" },
    ];
    const assignments: AssignmentInput[] = [
      { altStaffId: "alt-appel", altLocationId: "alt-spicery", ztDepartment: "Küche" },
    ];
    const r = computeAssignmentPlan({
      assignments,
      skills: [],
      staffMap: staffMap(),
      locationMap: locMap(),
      skillMap: skillMap(),
      currentLocations: current,
      currentSkills: [],
      skillsMode: "replace",
    });
    expect(r.totals.locationsRemoved).toBe(0);
    expect(r.perStaff).toHaveLength(1);
    expect(r.perStaff[0].staffId).toBe(STAFF_APPEL);
  });
});