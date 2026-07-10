import { describe, expect, it } from "vitest";
import { entryRowDepartment, primaryDepartment } from "./primary-department";

describe("primaryDepartment", () => {
  it("prefers kitchen over service and gl", () => {
    expect(primaryDepartment(["kitchen", "service", "gl"])).toBe("kitchen");
    expect(primaryDepartment(["gl", "kitchen"])).toBe("kitchen");
  });
  it("prefers service over gl", () => {
    expect(primaryDepartment(["service", "gl"])).toBe("service");
    expect(primaryDepartment(["gl", "service"])).toBe("service");
  });
  it("returns gl when only gl is assigned", () => {
    expect(primaryDepartment(["gl"])).toBe("gl");
  });
  it("returns kitchen or service on their own", () => {
    expect(primaryDepartment(["kitchen"])).toBe("kitchen");
    expect(primaryDepartment(["service"])).toBe("service");
  });
  it("falls back to service on empty input", () => {
    expect(primaryDepartment([])).toBe("service");
  });
  it("is order-independent", () => {
    expect(primaryDepartment(["service", "kitchen"])).toBe("kitchen");
    expect(primaryDepartment(["kitchen", "service"])).toBe("kitchen");
  });
});

describe("entryRowDepartment", () => {
  it("routes NULL entries to the primary row without warning", () => {
    expect(entryRowDepartment(null, ["kitchen", "gl"])).toEqual({
      department: "kitchen",
      mismatched: false,
    });
  });
  it("keeps entry on its own department when assigned", () => {
    expect(entryRowDepartment("gl", ["kitchen", "gl"])).toEqual({
      department: "gl",
      mismatched: false,
    });
  });
  it("falls back to primary row + warning if entry dept not assigned", () => {
    expect(entryRowDepartment("gl", ["kitchen"])).toEqual({
      department: "kitchen",
      mismatched: true,
    });
  });
  it("handles empty staff dept list", () => {
    expect(entryRowDepartment(null, [])).toEqual({
      department: "service",
      mismatched: false,
    });
    expect(entryRowDepartment("gl", [])).toEqual({
      department: "service",
      mismatched: true,
    });
  });
  it("Z3b: NULL entry uses rosterArea over static kitchen>service>gl", () => {
    // Mo-Fall: kitchen + service + gl zugeordnet, aber Dienstplan = service.
    expect(
      entryRowDepartment(null, ["kitchen", "service", "gl"], { rosterArea: "service" }),
    ).toEqual({ department: "service", mismatched: false });
  });
  it("Z3b: rosterArea ignored when not in staffDepts", () => {
    expect(
      entryRowDepartment(null, ["service"], { rosterArea: "kitchen" }),
    ).toEqual({ department: "service", mismatched: false });
  });
  it("Z3b: entryDept still wins over rosterArea when both set", () => {
    expect(
      entryRowDepartment("kitchen", ["kitchen", "service"], { rosterArea: "service" }),
    ).toEqual({ department: "kitchen", mismatched: false });
  });
  it("Z3b: rosterArea does not fire without staffDepts membership", () => {
    expect(
      entryRowDepartment(null, ["kitchen"], { rosterArea: "service" }),
    ).toEqual({ department: "kitchen", mismatched: false });
  });
});
