import { describe, it, expect } from "vitest";
import {
  isSkillCategoryEligible,
  ineligibleSkills,
  distinctDepartments,
} from "./skill-eligibility";

describe("isSkillCategoryEligible", () => {
  it("other ist immer eligible", () => {
    expect(isSkillCategoryEligible("other", [])).toBe(true);
  });
  it("kitchen ohne kitchen-Abteilung ist nicht eligible", () => {
    expect(isSkillCategoryEligible("kitchen", ["service"])).toBe(false);
  });
  it("kitchen mit kitchen-Abteilung ist eligible", () => {
    expect(isSkillCategoryEligible("kitchen", ["kitchen", "service"])).toBe(true);
  });
});

describe("ineligibleSkills", () => {
  it("filtert genau die Skills ohne passende Abteilung (other bleibt)", () => {
    const held = [{ category: "kitchen" as const }, { category: "other" as const }];
    const result = ineligibleSkills(held, ["service"]);
    expect(result).toEqual([{ category: "kitchen" }]);
  });
  it("leeres Ergebnis, wenn alles passt", () => {
    expect(ineligibleSkills([{ category: "service" as const }], ["service"])).toEqual([]);
  });
});

describe("distinctDepartments", () => {
  it("dedupliziert und behält die Reihenfolge stabil", () => {
    expect(
      distinctDepartments([
        { department: "service" },
        { department: "service" },
        { department: "kitchen" },
      ]),
    ).toEqual(["service", "kitchen"]);
  });
});