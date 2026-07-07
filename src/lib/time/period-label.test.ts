import { describe, it, expect } from "vitest";
import { derivePeriodLabel, DISPLAY_PERIOD_SWITCH_HOUR } from "./period-label";

describe("derivePeriodLabel", () => {
  it("konstante Umschaltzeit ist 15", () => {
    expect(DISPLAY_PERIOD_SWITCH_HOUR).toBe(15);
  });

  it("14:59 Berliner Ortszeit = Mittag", () => {
    // UTC 13:59 = 14:59 CEST (Sommerzeit, Juli)
    expect(derivePeriodLabel("2026-07-15T12:59:59Z", "Europe/Berlin")).toBe("Mittag");
  });

  it("Grenzfall 15:00 Berliner Ortszeit = Abend", () => {
    // UTC 13:00 = 15:00 CEST
    expect(derivePeriodLabel("2026-07-15T13:00:00Z", "Europe/Berlin")).toBe("Abend");
  });

  it("15:00 in Winterzeit (Berlin CET = UTC+1)", () => {
    // UTC 14:00 = 15:00 CET (Januar)
    expect(derivePeriodLabel("2026-01-15T14:00:00Z", "Europe/Berlin")).toBe("Abend");
  });

  it("14:59 in Winterzeit = Mittag", () => {
    expect(derivePeriodLabel("2026-01-15T13:59:00Z", "Europe/Berlin")).toBe("Mittag");
  });

  it("Zeitzone wird beachtet — 15:00 UTC in London = Abend, in Los Angeles noch Mittag", () => {
    expect(derivePeriodLabel("2026-07-15T15:00:00Z", "Europe/London")).toBe("Abend"); // 16:00 BST
    expect(derivePeriodLabel("2026-07-15T15:00:00Z", "America/Los_Angeles")).toBe("Mittag"); // 08:00 PDT
  });

  it("Default-Zeitzone ist Europe/Berlin", () => {
    expect(derivePeriodLabel("2026-07-15T13:00:00Z")).toBe("Abend");
    expect(derivePeriodLabel("2026-07-15T12:59:00Z")).toBe("Mittag");
  });

  it("ungültige Startzeit wirft", () => {
    expect(() => derivePeriodLabel("nicht-iso")).toThrow(/ungültige Startzeit/);
  });
});