import { describe, expect, it } from "vitest";
import {
  canCancelLeave,
  canDecideLeave,
  countLeaveDays,
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
});
