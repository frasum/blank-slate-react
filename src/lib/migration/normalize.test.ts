import { describe, it, expect } from "vitest";
import {
  utcIsoToBerlinHHMM,
  isSundayDate,
  berlinWallClockToUTC,
  combineDateAndTimes,
} from "./normalize";

describe("utcIsoToBerlinHHMM (DST-sicher via Intl)", () => {
  it("Winter (MEZ, UTC+1): 17:00 Berlin == 16:00Z", () => {
    expect(utcIsoToBerlinHHMM("2026-01-15T16:00:00.000Z")).toBe("17:00");
  });
  it("Sommer (MESZ, UTC+2): 17:00 Berlin == 15:00Z", () => {
    // Wäre getHours()/UTC im Sommer fälschlich 15:00 — Intl gibt 17:00.
    expect(utcIsoToBerlinHHMM("2026-07-15T15:00:00.000Z")).toBe("17:00");
  });
  it("Mitternacht Berlin Sommerzeit", () => {
    expect(utcIsoToBerlinHHMM("2026-07-15T22:00:00.000Z")).toBe("00:00");
  });
});

describe("isSundayDate", () => {
  it("erkennt Sonntag", () => {
    expect(isSundayDate("2026-01-18")).toBe(true); // Sonntag
    expect(isSundayDate("2026-01-19")).toBe(false); // Montag
  });
});

describe("berlinWallClockToUTC + combineDateAndTimes (Spot-Checks)", () => {
  it("Winter: 17:00 Berlin → 16:00Z", () => {
    expect(berlinWallClockToUTC(2026, 1, 15, 17, 0, 0)).toBe("2026-01-15T16:00:00.000Z");
  });
  it("Übernacht: 22:00→02:00 → end am Folgetag", () => {
    const r = combineDateAndTimes("2026-01-15", "22:00:00", "02:00:00");
    expect(r).not.toBeNull();
    expect(r!.startedAt).toBe("2026-01-15T21:00:00.000Z");
    expect(r!.endedAt).toBe("2026-01-16T01:00:00.000Z");
  });
});
