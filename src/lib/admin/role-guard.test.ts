import { describe, it, expect } from "vitest";
import { assertMinRole, hasMinRole, ForbiddenError } from "./role-guard";

describe("role-guard", () => {
  it("admin erfüllt jede Mindestrolle", () => {
    expect(hasMinRole("admin", "admin")).toBe(true);
    expect(hasMinRole("admin", "manager")).toBe(true);
    expect(hasMinRole("admin", "staff")).toBe(true);
  });
  it("manager erfüllt manager und staff, NICHT admin", () => {
    expect(hasMinRole("manager", "admin")).toBe(false);
    expect(hasMinRole("manager", "manager")).toBe(true);
    expect(hasMinRole("manager", "staff")).toBe(true);
  });
  it("staff erfüllt nur staff", () => {
    expect(hasMinRole("staff", "admin")).toBe(false);
    expect(hasMinRole("staff", "manager")).toBe(false);
    expect(hasMinRole("staff", "staff")).toBe(true);
  });
  it("null erfüllt keine Mindestrolle", () => {
    expect(hasMinRole(null, "staff")).toBe(false);
  });
  it("assertMinRole wirft ForbiddenError bei unzureichender Rolle", () => {
    expect(() => assertMinRole("staff", "admin")).toThrow(ForbiddenError);
    expect(() => assertMinRole(null, "manager")).toThrow(ForbiddenError);
  });
  it("assertMinRole wirft NICHT bei ausreichender Rolle", () => {
    expect(() => assertMinRole("admin", "admin")).not.toThrow();
    expect(() => assertMinRole("manager", "manager")).not.toThrow();
  });
});