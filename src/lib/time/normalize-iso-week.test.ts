// N12 (Nachprüfung 13.07.): Nicht-Montage werden auf den Montag derselben
// ISO-Woche normalisiert (Server-Regel für getWeeklyTimeEntries[Batch]),
// statt die Anfrage abzulehnen.
import { describe, it, expect } from "vitest";
import { _normalizeIsoWeekForTest as normalizeIsoWeek } from "./time-admin.functions";

describe("normalizeIsoWeek (N12)", () => {
  it("Mittwoch → Montag–Sonntag derselben Woche", () => {
    // 2026-07-15 (Mi) → Woche 2026-07-13 (Mo) .. 2026-07-19 (So).
    expect(normalizeIsoWeek("2026-07-15")).toEqual({
      weekStart: "2026-07-13",
      weekEnd: "2026-07-19",
    });
  });
  it("Montag bleibt Montag", () => {
    expect(normalizeIsoWeek("2026-07-13")).toEqual({
      weekStart: "2026-07-13",
      weekEnd: "2026-07-19",
    });
  });
  it("Sonntag → Montag der VORHERIGEN Kalenderwoche (Mo–So)", () => {
    // 2026-07-19 (So) → Montag = 2026-07-13.
    expect(normalizeIsoWeek("2026-07-19")).toEqual({
      weekStart: "2026-07-13",
      weekEnd: "2026-07-19",
    });
  });
});
