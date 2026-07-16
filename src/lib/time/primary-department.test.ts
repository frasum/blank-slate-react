import { describe, expect, it } from "vitest";
import { entryRowDepartment, primaryDepartment } from "./primary-department";

describe("primaryDepartment", () => {
  it("WZ1/KGL: prefers gl over kitchen and service", () => {
    expect(primaryDepartment(["kitchen", "service", "gl"])).toBe("gl");
    expect(primaryDepartment(["gl", "kitchen"])).toBe("gl");
  });
  it("WZ1/KGL: LAM-Fall (service+gl) → gl", () => {
    expect(primaryDepartment(["service", "gl"])).toBe("gl");
    expect(primaryDepartment(["gl", "service"])).toBe("gl");
  });
  it("prefers kitchen over service when no gl", () => {
    expect(primaryDepartment(["kitchen", "service"])).toBe("kitchen");
    expect(primaryDepartment(["service", "kitchen"])).toBe("kitchen");
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
  it("is order-independent (gl priority)", () => {
    expect(primaryDepartment(["service", "gl", "kitchen"])).toBe("gl");
    expect(primaryDepartment(["kitchen", "gl"])).toBe("gl");
  });
});

describe("entryRowDepartment", () => {
  it("routes NULL entries to the primary row without warning", () => {
    expect(entryRowDepartment(null, ["kitchen", "gl"])).toEqual({
      department: "gl",
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
    expect(entryRowDepartment(null, ["service"], { rosterArea: "kitchen" })).toEqual({
      department: "service",
      mismatched: false,
    });
  });
  it("Z3b: entryDept still wins over rosterArea when both set", () => {
    expect(
      entryRowDepartment("kitchen", ["kitchen", "service"], { rosterArea: "service" }),
    ).toEqual({ department: "kitchen", mismatched: false });
  });
  it("Z3b: rosterArea does not fire without staffDepts membership", () => {
    expect(entryRowDepartment(null, ["kitchen", "gl"], { rosterArea: "service" })).toEqual({
      department: "gl",
      mismatched: false,
    });
  });
  it("W2: GL-Person + NULL-Eintrag + service-rosterArea → GL-Zeile", () => {
    expect(
      entryRowDepartment(null, ["service", "gl"], { rosterArea: "service" }),
    ).toEqual({ department: "gl", mismatched: false });
  });
  it("W2: GL-Person mit explizitem service-Eintrag → Service-Zeile (rawDepartment gewinnt)", () => {
    expect(
      entryRowDepartment("service", ["service", "gl"], { rosterArea: "service" }),
    ).toEqual({ department: "service", mismatched: false });
  });
  it("W2: Nicht-GL-Person + rosterArea → Z3b unverändert", () => {
    expect(
      entryRowDepartment(null, ["kitchen", "service"], { rosterArea: "service" }),
    ).toEqual({ department: "service", mismatched: false });
  });
  it("W2: GL-Person ohne Roster → GL-Zeile (Bestand)", () => {
    expect(entryRowDepartment(null, ["service", "gl"])).toEqual({
      department: "gl",
      mismatched: false,
    });
  });
});
