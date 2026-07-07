import { describe, expect, it } from "vitest";
import {
  canCancelLeave,
  canDecideLeave,
  countLeaveDays,
  countHolidaysInRange,
  isValidLeaveRange,
} from "./leave-requests";

describe("leave-requests", () => {
  describe("isValidLeaveRange", () => {
    it("akzeptiert end == start", () => {
      expect(isValidLeaveRange("2026-06-17", "2026-06-17")).toBe(true);
    });
    it("akzeptiert end > start", () => {
      expect(isValidLeaveRange("2026-06-17", "2026-06-20")).toBe(true);
    });
    it("lehnt end < start ab", () => {
      expect(isValidLeaveRange("2026-06-20", "2026-06-17")).toBe(false);
    });
    it("lehnt ungültige ISO ab", () => {
      expect(isValidLeaveRange("17.06.2026", "2026-06-20")).toBe(false);
    });
  });

  describe("countLeaveDays", () => {
    it("1 Tag", () => {
      expect(countLeaveDays("2026-06-17", "2026-06-17")).toBe(1);
    });
    it("Mehrtage inklusiv", () => {
      expect(countLeaveDays("2026-06-17", "2026-06-19")).toBe(3);
    });
    it("ungültige Range = 0", () => {
      expect(countLeaveDays("2026-06-20", "2026-06-17")).toBe(0);
    });
  });

  describe("canCancelLeave / canDecideLeave", () => {
    it("nur offen", () => {
      expect(canCancelLeave("offen")).toBe(true);
      expect(canCancelLeave("genehmigt")).toBe(false);
      expect(canCancelLeave("abgelehnt")).toBe(false);
      expect(canDecideLeave("offen")).toBe(true);
      expect(canDecideLeave("genehmigt")).toBe(false);
      expect(canDecideLeave("abgelehnt")).toBe(false);
    });
  });

  describe("countLeaveDays mit Feiertagen", () => {
    it("ohne Feiertags-Set unverändert", () => {
      expect(countLeaveDays("2026-08-14", "2026-08-16")).toBe(3);
    });
    it("Feiertag mitten drin zählt nicht", () => {
      const h = new Set(["2026-08-15"]);
      expect(countLeaveDays("2026-08-14", "2026-08-16", h)).toBe(2);
    });
    it("Feiertag am Rand", () => {
      const h = new Set(["2026-08-14"]);
      expect(countLeaveDays("2026-08-14", "2026-08-16", h)).toBe(2);
    });
    it("mehrere Feiertage", () => {
      const h = new Set(["2026-08-15", "2026-08-16"]);
      expect(countLeaveDays("2026-08-14", "2026-08-17", h)).toBe(2);
    });
    it("Feiertag außerhalb des Zeitraums", () => {
      const h = new Set(["2026-09-01"]);
      expect(countLeaveDays("2026-08-14", "2026-08-16", h)).toBe(3);
    });
    it("nur Feiertage → 0", () => {
      const h = new Set(["2026-08-15", "2026-08-16"]);
      expect(countLeaveDays("2026-08-15", "2026-08-16", h)).toBe(0);
    });
  });

  describe("countHolidaysInRange", () => {
    it("leeres Set → 0", () => {
      expect(countHolidaysInRange("2026-08-14", "2026-08-16", new Set())).toBe(0);
    });
    it("zählt nur Treffer im Bereich", () => {
      const h = new Set(["2026-08-15", "2026-09-01"]);
      expect(countHolidaysInRange("2026-08-14", "2026-08-16", h)).toBe(1);
    });
  });
});
