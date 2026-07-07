import { describe, expect, it } from "vitest";
import { isClosedDay, isoWeekday, type CalendarExceptionKind } from "./business-calendar";

describe("isoWeekday", () => {
  it("Mo=1 … So=7", () => {
    // 2026-06-15 = Montag
    expect(isoWeekday("2026-06-15")).toBe(1);
    expect(isoWeekday("2026-06-16")).toBe(2);
    expect(isoWeekday("2026-06-20")).toBe(6); // Sa
    expect(isoWeekday("2026-06-21")).toBe(7); // So
  });
  it("Jahreswechsel", () => {
    expect(isoWeekday("2025-12-31")).toBe(3); // Mi
    expect(isoWeekday("2026-01-01")).toBe(4); // Do
  });
});

describe("isClosedDay", () => {
  const rest = [1]; // Montag Ruhetag
  const empty = new Map<string, CalendarExceptionKind>();

  it("Ruhetag & keine Ausnahme → zu", () => {
    expect(isClosedDay("2026-06-15", rest, empty)).toBe(true);
  });
  it("Ruhetag & Ausnahme 'open' → offen", () => {
    const ex = new Map<string, CalendarExceptionKind>([["2026-06-15", "open"]]);
    expect(isClosedDay("2026-06-15", rest, ex)).toBe(false);
  });
  it("Nicht-Ruhetag & Ausnahme 'closed' → zu", () => {
    const ex = new Map<string, CalendarExceptionKind>([["2026-06-16", "closed"]]);
    expect(isClosedDay("2026-06-16", rest, ex)).toBe(true);
  });
  it("Nicht-Ruhetag & keine Ausnahme → offen", () => {
    expect(isClosedDay("2026-06-16", rest, empty)).toBe(false);
  });
  it("leere restWeekdays → nur Ausnahmen zählen", () => {
    expect(isClosedDay("2026-06-15", [], empty)).toBe(false);
  });
});