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

  // N6 — Fachregel Frank 13.07.2026: Urlaubszählung nach 5-Tage-Modell,
  // Mo–Fr zählt, Sa/So nie, Feiertage zählen als normale Werktage.
  describe("countLeaveDays (5-Tage-Modell)", () => {
    it("Mo–So (eine Woche) → 5", () => {
      // 2026-06-15 (Mo) – 2026-06-21 (So)
      expect(countLeaveDays("2026-06-15", "2026-06-21")).toBe(5);
    });
    it("Di–Do → 3", () => {
      // 2026-06-16 (Di) – 2026-06-18 (Do)
      expect(countLeaveDays("2026-06-16", "2026-06-18")).toBe(3);
    });
    it("zwei volle Wochen → 10", () => {
      // 2026-06-15 (Mo) – 2026-06-28 (So)
      expect(countLeaveDays("2026-06-15", "2026-06-28")).toBe(10);
    });
    it("Woche mit Pfingstmontag (2026-05-25 Mo) bis So → trotzdem 5", () => {
      // 2026-05-25 (Mo, Pfingstmontag) – 2026-05-31 (So)
      expect(countLeaveDays("2026-05-25", "2026-05-31")).toBe(5);
    });
    it("Sa–So → 0", () => {
      // 2026-06-20 (Sa) – 2026-06-21 (So)
      expect(countLeaveDays("2026-06-20", "2026-06-21")).toBe(0);
    });
    it("einzelner Sonntag → 0", () => {
      expect(countLeaveDays("2026-06-21", "2026-06-21")).toBe(0);
    });
    it("einzelner Feiertag auf Mittwoch → 1", () => {
      // 2026-06-03 wäre kein Feiertag; nehmen wir Fronleichnam 2026-06-04 (Do).
      // Fachregel: Feiertag zählt als normaler Werktag. Ein Mittwoch (Werktag)
      // wird als Urlaubstag verbraucht — hier 2026-05-13 (Mi, Christi Himmelfahrt am 14. Do — 13. ist normaler Mi).
      // Verwende einen echten Feiertags-Mittwoch: es gibt in Bayern keinen — nimm Neujahr 2025-01-01 (Mi).
      expect(countLeaveDays("2025-01-01", "2025-01-01")).toBe(1);
    });
    it("Mo–Mo (8 Tage über Wochenende) → 6", () => {
      // 2026-06-15 (Mo) – 2026-06-22 (Mo)
      expect(countLeaveDays("2026-06-15", "2026-06-22")).toBe(6);
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
