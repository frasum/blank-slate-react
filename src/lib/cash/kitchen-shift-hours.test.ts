import { describe, expect, it } from "vitest";
import { kitchenShiftMinutes } from "./kitchen-shift-hours";

describe("kitchenShiftMinutes", () => {
  it("Tagschicht 10:00–18:00 → 480", () => {
    expect(kitchenShiftMinutes("10:00", "18:00")).toBe(480);
  });
  it("Nachtschicht 22:00–02:00 → 240", () => {
    expect(kitchenShiftMinutes("22:00", "02:00")).toBe(240);
  });
  it("Legacy 17:00–01:00 → 480", () => {
    expect(kitchenShiftMinutes("17:00", "01:00")).toBe(480);
  });
  it("Gleichstand 12:00–12:00 → 0 (Abweichung vom Legacy-Quirk)", () => {
    expect(kitchenShiftMinutes("12:00", "12:00")).toBe(0);
  });
  it("ungültiges Format wirft", () => {
    expect(() => kitchenShiftMinutes("25:00", "10:00")).toThrow();
    expect(() => kitchenShiftMinutes("ab", "10:00")).toThrow();
    expect(() => kitchenShiftMinutes("10:00", "9:99")).toThrow();
  });
});