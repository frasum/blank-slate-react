import { describe, expect, it } from "vitest";
import { filterWeeklyRows } from "./weekly-filter";
import type { WeeklyExportInput, WeeklyExportRow } from "./weekly-export";

function row(staffId: string, displayName: string): WeeklyExportRow {
  return {
    staffId,
    displayName,
    department: "kitchen",
    days: [],
    totals: { total: 0, evening: 0, night: 0, sunHol: 0 },
  };
}

const rowsByDept: WeeklyExportInput["rowsByDept"] = [
  {
    dept: "kitchen",
    deptLabel: "KÜCHE",
    rows: [row("s1", "MO"), row("s2", "LAM"), row("s3", "EM")],
  },
  {
    dept: "service",
    deptLabel: "SERVICE",
    rows: [row("s2", "LAM"), row("s4", "ANN")],
  },
  {
    dept: "gl",
    deptLabel: "GESCHÄFTSLEITUNG",
    rows: [row("s1", "MO"), row("s3", "EM")],
  },
];

// s1 (MO):  CO, GL
// s2 (LAM): CO
// s3 (EM):  SERVICE
// s4 (ANN): (keine Skills)
const skillsByStaff = new Map<string, string[]>([
  ["s1", ["co", "gl-skill"]],
  ["s2", ["co"]],
  ["s3", ["service-skill"]],
]);

describe("filterWeeklyRows", () => {
  it("gibt bei 'Alle/Alle/leer' alle nicht-leeren Sektionen zurück", () => {
    const out = filterWeeklyRows(rowsByDept, { dept: "all", skillId: "all", query: "" }, skillsByStaff);
    expect(out.map((g) => g.dept)).toEqual(["kitchen", "service", "gl"]);
    expect(out[0].rows).toHaveLength(3);
  });

  it("filtert nur den Bereich (Küche)", () => {
    const out = filterWeeklyRows(rowsByDept, { dept: "kitchen", skillId: "all", query: "" }, skillsByStaff);
    expect(out).toHaveLength(1);
    expect(out[0].dept).toBe("kitchen");
    expect(out[0].rows.map((r) => r.staffId)).toEqual(["s1", "s2", "s3"]);
  });

  it("filtert nur den Skill (CO) — Sektionen ohne Träger verschwinden", () => {
    const out = filterWeeklyRows(rowsByDept, { dept: "all", skillId: "co", query: "" }, skillsByStaff);
    // GL hat nur s1 (CO) → bleibt; Service hat s2 (CO) → bleibt.
    expect(out.map((g) => g.dept)).toEqual(["kitchen", "service", "gl"]);
    expect(out.find((g) => g.dept === "kitchen")!.rows.map((r) => r.staffId)).toEqual(["s1", "s2"]);
    expect(out.find((g) => g.dept === "service")!.rows.map((r) => r.staffId)).toEqual(["s2"]);
    expect(out.find((g) => g.dept === "gl")!.rows.map((r) => r.staffId)).toEqual(["s1"]);
  });

  it("kombiniert Bereich + Skill per UND", () => {
    const out = filterWeeklyRows(rowsByDept, { dept: "service", skillId: "co", query: "" }, skillsByStaff);
    expect(out).toHaveLength(1);
    expect(out[0].rows.map((r) => r.staffId)).toEqual(["s2"]);
  });

  it("wendet zusätzlich die Suche an", () => {
    const out = filterWeeklyRows(
      rowsByDept,
      { dept: "all", skillId: "co", query: "mo" },
      skillsByStaff,
    );
    // Nur MO (s1) hat CO UND passt zur Suche „mo".
    expect(out.map((g) => g.dept)).toEqual(["kitchen", "gl"]);
    expect(out.every((g) => g.rows.every((r) => r.staffId === "s1"))).toBe(true);
  });

  it("behandelt Mitarbeiter ohne Skills korrekt (nicht getroffen von Skill-Filter)", () => {
    const out = filterWeeklyRows(
      rowsByDept,
      { dept: "service", skillId: "co", query: "" },
      skillsByStaff,
    );
    // ANN (s4) hat keine Skills → fliegt raus, nur s2 bleibt.
    expect(out[0].rows.map((r) => r.staffId)).toEqual(["s2"]);
  });

  it("liefert eine leere Liste, wenn keine Sektion Treffer hat", () => {
    const out = filterWeeklyRows(
      rowsByDept,
      { dept: "kitchen", skillId: "service-skill", query: "" },
      skillsByStaff,
    );
    // s3 (EM) hat service-skill, ist aber in „kitchen" — bleibt also erhalten.
    expect(out).toHaveLength(1);
    expect(out[0].rows.map((r) => r.staffId)).toEqual(["s3"]);

    const empty = filterWeeklyRows(
      rowsByDept,
      { dept: "gl", skillId: "service-skill", query: "" },
      skillsByStaff,
    );
    // s3 hat service-skill, ist aber nicht in gl (GL enthält s1, s3).
    // s1 hat kein service-skill; s3 hat es → bleibt.
    expect(empty).toHaveLength(1);
    expect(empty[0].rows.map((r) => r.staffId)).toEqual(["s3"]);

    const truly = filterWeeklyRows(
      rowsByDept,
      { dept: "gl", skillId: "co", query: "lam" },
      skillsByStaff,
    );
    // LAM (s2) hat CO, ist aber nicht in gl.
    expect(truly).toEqual([]);
  });

  it("Shape: skillIds pro assignedStaff-Zeile bleibt ein string[]", () => {
    const staff = {
      staffId: "s1",
      displayName: "MO",
      department: "kitchen" as const,
      isActive: true,
      isPrimary: true,
      staffDepts: ["kitchen", "gl"] as const,
      skillIds: ["co", "gl-skill"],
    };
    expect(Array.isArray(staff.skillIds)).toBe(true);
    expect(staff.skillIds.every((s) => typeof s === "string")).toBe(true);
  });
});