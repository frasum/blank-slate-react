import { describe, it, expect } from "vitest";
import { arbzgMinimumBreak, isArbzgShort, grossMinutesBetween } from "./break-rules";

describe("arbzgMinimumBreak", () => {
  it("0 Pause bei ≤6h", () => {
    expect(arbzgMinimumBreak(0)).toBe(0);
    expect(arbzgMinimumBreak(360)).toBe(0); // genau 6h → noch 0
  });
  it("30 min bei >6h bis ≤9h", () => {
    expect(arbzgMinimumBreak(361)).toBe(30);
    expect(arbzgMinimumBreak(540)).toBe(30); // genau 9h → noch 30
  });
  it("45 min bei >9h", () => {
    expect(arbzgMinimumBreak(541)).toBe(45);
    expect(arbzgMinimumBreak(720)).toBe(45);
  });
});

describe("isArbzgShort", () => {
  it("markiert kürzere Pause als Empfehlung", () => {
    expect(isArbzgShort(480, 0)).toBe(true);
    expect(isArbzgShort(480, 30)).toBe(false);
    expect(isArbzgShort(600, 30)).toBe(true);
    expect(isArbzgShort(600, 45)).toBe(false);
  });
});

describe("grossMinutesBetween", () => {
  it("rundet auf Minuten und ist nie negativ", () => {
    const a = new Date("2026-01-01T10:00:00Z");
    const b = new Date("2026-01-01T18:30:00Z");
    expect(grossMinutesBetween(a, b)).toBe(510);
    expect(grossMinutesBetween(b, a)).toBe(0);
  });
});
