import { describe, it, expect } from "vitest";
import { filterStaffByCategory, type StaffOption } from "./filter-staff-by-category";

const make = (over: Partial<StaffOption>): StaffOption => ({
  id: over.id ?? "x",
  name: over.name ?? "X",
  role: over.role ?? null,
  skillCategories: over.skillCategories ?? [],
});

describe("filterStaffByCategory", () => {
  const all: StaffOption[] = [
    make({ id: "svc", skillCategories: ["service"] }),
    make({ id: "kit", skillCategories: ["kitchen"] }),
    make({ id: "mgr", role: "manager" }),
    make({ id: "adm", role: "admin" }),
    make({ id: "staff", role: "staff" }),
    make({ id: "other", skillCategories: ["other"] }),
    make({ id: "none" }),
  ];

  it("service: nur Mitarbeiter mit service-Skill", () => {
    const ids = filterStaffByCategory(all, "service").map((s) => s.id);
    expect(ids).toEqual(["svc"]);
  });

  it("kitchen: nur Mitarbeiter mit kitchen-Skill", () => {
    const ids = filterStaffByCategory(all, "kitchen").map((s) => s.id);
    expect(ids).toEqual(["kit"]);
  });

  it("manager_admin: nur admin/manager", () => {
    const ids = filterStaffByCategory(all, "manager_admin").map((s) => s.id);
    expect(ids.sort()).toEqual(["adm", "mgr"].sort());
  });

  it("manager_admin: role=null (Staff-Sicht für Kollegen) liefert leere Liste", () => {
    const staffSightOnly = all.map((s) => ({ ...s, role: null }));
    expect(filterStaffByCategory(staffSightOnly, "manager_admin")).toEqual([]);
  });

  it("maintenance: admin/manager ODER other-Skill", () => {
    const ids = filterStaffByCategory(all, "maintenance").map((s) => s.id);
    expect(ids.sort()).toEqual(["adm", "mgr", "other"].sort());
  });

  it("maintenance: matcht via other-Skill auch ohne Rolle", () => {
    const only = [make({ id: "o", role: null, skillCategories: ["other"] })];
    expect(filterStaffByCategory(only, "maintenance").map((s) => s.id)).toEqual(["o"]);
  });

  it("Negativfall service: kitchen-Mitarbeiter ist NICHT enthalten", () => {
    const ids = filterStaffByCategory(all, "service").map((s) => s.id);
    expect(ids).not.toContain("kit");
  });

  it("Negativfall kitchen: service-Mitarbeiter ist NICHT enthalten", () => {
    const ids = filterStaffByCategory(all, "kitchen").map((s) => s.id);
    expect(ids).not.toContain("svc");
  });
});