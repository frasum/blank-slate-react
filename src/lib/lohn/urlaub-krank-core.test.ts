import { describe, it, expect } from "vitest";
import { workRate, estimateWorkdays } from "./urlaub-krank-core";

describe("workRate", () => {
  it("berechnet Soll-Arbeitstage-Quote im Fenster", () => {
    expect(workRate(78, 91)).toBeCloseTo(0.857, 3);
  });
  it("ist 0 bei keinem Soll-Arbeitstag", () => {
    expect(workRate(0, 91)).toBe(0);
  });
  it("clamped auf 1, wenn mehr Soll-Arbeitstage als Fenster", () => {
    expect(workRate(100, 91)).toBe(1);
  });
  it("ist 0 bei leerem Fenster", () => {
    expect(workRate(5, 0)).toBe(0);
  });
});

describe("estimateWorkdays", () => {
  it("rundet Kalendertage × Rate", () => {
    expect(estimateWorkdays(25, 0.857)).toBe(21);
    expect(estimateWorkdays(5, 0.714)).toBe(4);
    expect(estimateWorkdays(1, 0.857)).toBe(1);
  });
});
