import { describe, it, expect } from "vitest";
import { formatAbsenceNote } from "./absence-note";

describe("formatAbsenceNote", () => {
  const P_START = "2026-07-01";
  const P_END = "2026-07-31";

  it("leer wenn keine Tage", () => {
    expect(formatAbsenceNote([], P_START, P_END)).toBe("");
  });

  it("Einzeltag Krank", () => {
    expect(formatAbsenceNote([{ date: "2026-07-03", type: "krank" }], P_START, P_END)).toBe(
      "Krank 03.07.",
    );
  });

  it("Mehrtages-Merge Urlaub", () => {
    const dates = ["2026-07-12", "2026-07-13", "2026-07-14"].map((d) => ({
      date: d,
      type: "urlaub" as const,
    }));
    expect(formatAbsenceNote(dates, P_START, P_END)).toBe("Urlaub 12.–14.07.");
  });

  it("gemischt & chronologisch mit ·", () => {
    const dates = [
      { date: "2026-07-12", type: "urlaub" as const },
      { date: "2026-07-13", type: "urlaub" as const },
      { date: "2026-07-14", type: "urlaub" as const },
      { date: "2026-07-03", type: "krank" as const },
      { date: "2026-07-04", type: "krank" as const },
    ];
    expect(formatAbsenceNote(dates, P_START, P_END)).toBe("Krank 03.–04.07. · Urlaub 12.–14.07.");
  });

  it("Perioden-Kappung schneidet Tage außerhalb ab", () => {
    const dates = [
      { date: "2026-06-28", type: "urlaub" as const },
      { date: "2026-07-01", type: "urlaub" as const },
      { date: "2026-07-02", type: "urlaub" as const },
      { date: "2026-08-05", type: "urlaub" as const },
    ];
    expect(formatAbsenceNote(dates, P_START, P_END)).toBe("Urlaub 01.–02.07.");
  });

  it("Bereich über Monatsgrenze innerhalb der Periode", () => {
    const dates = ["2026-06-28", "2026-06-29", "2026-06-30", "2026-07-01", "2026-07-02"].map(
      (d) => ({
        date: d,
        type: "urlaub" as const,
      }),
    );
    expect(formatAbsenceNote(dates, "2026-06-26", "2026-07-25")).toBe("Urlaub 28.06.–02.07.");
  });
});
