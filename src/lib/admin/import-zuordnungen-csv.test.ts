import { describe, it, expect } from "vitest";
import { parseImportCsvs } from "./import-zuordnungen-csv";

const ASSIGN = `\uFEFFalt_staff_id;name;nickname;restaurant_id;restaurant_name;role;zt_department
a1;Anna Appel;APPEL;loc1;R1;cook;Küche
a1;Anna Appel;APPEL;loc2;R2;cook;Küche
b2;Bea Bach;BEA;loc1;R1;waiter;Service
c3;Chef Chefin;CHEFIN;loc1;R1;gl;GL
d4;Doris Dup;DORIS;loc1;R1;waiter;Service
d4;Doris Dup;DORIS;loc1;R1;waiter;UNBEKANNT
`;

const SKILLS = `category;name;nickname;skill
kitchen;Anna Appel;APPEL;VS
kitchen;Anna Appel;APPEL;PASS
service;Bea Bach;BEA;BAR
gl;Chef Chefin;CHEFIN;GL
kitchen;Unbekannt Person;UNK;VS
`;

describe("parseImportCsvs", () => {
  it("parst Zuordnungen + Skills und löst Namen auf", () => {
    const r = parseImportCsvs({ assignmentsCsv: ASSIGN, skillsCsv: SKILLS });
    expect(r.staffCount).toBe(4);
    expect(r.assignments).toHaveLength(5);
    expect(r.skills).toEqual([
      { altStaffId: "a1", skillName: "VS" },
      { altStaffId: "a1", skillName: "PASS" },
      { altStaffId: "b2", skillName: "BAR" },
      { altStaffId: "c3", skillName: "GL" },
    ]);
    const warnKinds = r.warnings.map((w) => w.kind).sort();
    expect(warnKinds).toContain("assignment_unknown_zt_department");
    expect(warnKinds).toContain("skill_name_not_found");
  });

  it("meldet mehrdeutige Namen statt zu raten", () => {
    const assign = `alt_staff_id;name;nickname;restaurant_id;restaurant_name;role;zt_department
x1;Doppel Name;NICK1;loc1;R1;cook;Küche
x2;Doppel Name;NICK2;loc1;R1;cook;Küche
`;
    const skills = `category;name;nickname;skill
kitchen;Doppel Name;;VS
`;
    const r = parseImportCsvs({ assignmentsCsv: assign, skillsCsv: skills });
    expect(r.skills).toHaveLength(0);
    expect(r.warnings.some((w) => w.kind === "skill_name_ambiguous")).toBe(true);
  });
});