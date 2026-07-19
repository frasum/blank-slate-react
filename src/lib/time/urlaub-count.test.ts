// UZ1 v2 — Tests für 5-Tage-Modell-Zählung (Urlaub UND Krank).
import { describe, it, expect } from "vitest";
import { countAbsenceWorkdays, isAbsenceWorkday } from "./urlaub-count";

function range(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const d = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  while (d.getTime() <= end.getTime()) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

describe("countAbsenceWorkdays — 5-Tage-Modell (UZ1 v2)", () => {
  it("Golden Urlaub: 26.06.–25.07.2026 (30 Kalendertage) → 21 Werktage", () => {
    expect(countAbsenceWorkdays(range("2026-06-26", "2026-07-25"))).toBe(21);
  });

  it("Golden Krank: Mo–So (7 Kalendertage) → 5 Werktage", () => {
    // 2026-07-13 Mo … 2026-07-19 So
    expect(countAbsenceWorkdays(range("2026-07-13", "2026-07-19"))).toBe(5);
  });

  it("Nur Wochenende (Sa+So) → 0", () => {
    expect(countAbsenceWorkdays(["2026-07-18", "2026-07-19"])).toBe(0);
  });

  it("Einzeltag Montag → 1", () => {
    expect(countAbsenceWorkdays(["2026-07-20"])).toBe(1);
  });

  it("Block Fr–Mo → 2", () => {
    expect(countAbsenceWorkdays(range("2026-07-17", "2026-07-20"))).toBe(2);
  });

  it("Feiertage werden NICHT herausgerechnet (Mo=1)", () => {
    // 2026-01-01 war ein Donnerstag (Feiertag) — zählt als Werktag.
    expect(isAbsenceWorkday("2026-01-01")).toBe(true);
  });
});
