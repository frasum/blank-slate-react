import { describe, expect, it } from "vitest";
import {
  ReplacePosHourlyStatsInput,
  avgPerBookingCents,
  checkHourlyAgainstFooter,
  hourShare,
  type PosHourlyRow,
} from "./pos-hourly-server";

// zod 4 validiert Versions-/Varianten-Bits — Dummy muss RFC-4122-konform sein.
const LOC = "11111111-1111-4111-8111-111111111111";
const row: PosHourlyRow = { hour: 0, anzahl: 1, wertCents: 100 };

describe("ReplacePosHourlyStatsInput", () => {
  const base = {
    locationId: LOC,
    period: "alltime" as const,
    reportDate: "2026-01-01",
    rows: [row],
    footer: { anzahl: 1, wertCents: 100 },
  };

  it("akzeptiert einen gültigen Import", () => {
    expect(ReplacePosHourlyStatsInput.safeParse(base).success).toBe(true);
  });

  it("lehnt unbekannte Periode ab", () => {
    expect(
      ReplacePosHourlyStatsInput.safeParse({ ...base, period: "monat" }).success,
    ).toBe(false);
  });

  it("lehnt Zukunftsdatum ab", () => {
    expect(
      ReplacePosHourlyStatsInput.safeParse({ ...base, reportDate: "2999-12-31" }).success,
    ).toBe(false);
  });

  it("lehnt Stunden außerhalb 0–23 ab", () => {
    const bad = { ...base, rows: [{ ...row, hour: 24 }] };
    expect(ReplacePosHourlyStatsInput.safeParse(bad).success).toBe(false);
  });

  it("lehnt doppelte Stunde ab", () => {
    const bad = { ...base, rows: [row, row] };
    expect(ReplacePosHourlyStatsInput.safeParse(bad).success).toBe(false);
  });
});

describe("checkHourlyAgainstFooter", () => {
  it("erkennt exakten Treffer", () => {
    const r = checkHourlyAgainstFooter([row], { anzahl: 1, wertCents: 100 });
    expect(r.matches).toBe(true);
  });
  it("erkennt Mismatch", () => {
    const r = checkHourlyAgainstFooter([row], { anzahl: 2, wertCents: 100 });
    expect(r.matches).toBe(false);
  });
});

describe("hourShare / avgPerBookingCents", () => {
  it("berechnet Anteil, Summe 0 → null", () => {
    expect(hourShare(50, 200)).toBe(25);
    expect(hourShare(50, 0)).toBeNull();
  });
  it("negative Anteile korrekt", () => {
    expect(hourShare(-100, 400)).toBe(-25);
  });
  it("Ø pro Buchung, anzahl 0 → null", () => {
    expect(avgPerBookingCents(1000, 4)).toBe(250);
    expect(avgPerBookingCents(0, 0)).toBeNull();
  });
});