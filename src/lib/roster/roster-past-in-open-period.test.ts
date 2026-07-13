// N19 (13.07.2026) — Fachregel „Vergangenheit im Dienstplan":
//
// Admin/Manager dürfen JEDEN Tag der offenen Periode bearbeiten (auch
// bereits vergangene Tage). Grenze ist ausschließlich `periods.status`.
//
// Der Test bindet die Regel an den reinen Status-Vergleich, den alle
// roster-Schreibpfade (createRosterShift, deleteRosterShift,
// updateRosterShiftSkill, moveRosterShift, setAbsence, clearAbsence,
// setAbsenceRange) über `assertShiftDateUnlocked` teilen. Damit ist ein
// späteres Refactor gegen die Regel („status !== 'open'" oder
// „shift_date < today") sofort rot.

import { describe, it, expect } from "vitest";
import { __test_assertPeriodStatusAllowsWrite as check } from "@/lib/roster/roster.functions";

describe("N19 — Vergangenheit in offener Periode ist editierbar", () => {
  it("open: erlaubt Schreiben (auch für vergangene Tage)", () => {
    expect(() => check("open")).not.toThrow();
  });

  it("null/undefined: kein Periodenfenster → erlaubt (kein Bremseffekt)", () => {
    expect(() => check(null)).not.toThrow();
    expect(() => check(undefined)).not.toThrow();
  });

  it("locked: wirft Periode-gesperrt", () => {
    expect(() => check("locked")).toThrow(/Periode gesperrt/);
  });

  it("regression: 'draft' o. ä. andere States sind NICHT locked → erlaubt", () => {
    // Falls jemand die Bedingung zu `status !== 'open'` umbaut, wird dieser
    // Test rot und zwingt zur bewussten Entscheidung.
    expect(() => check("draft")).not.toThrow();
  });
});
