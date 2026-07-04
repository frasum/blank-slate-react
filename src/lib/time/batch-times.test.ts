import { describe, it, expect } from "vitest";
import { batchTimestamps, resolveBatchDay, standardTimesFor } from "./batch-times";

const S = {
  weekdayStart: "17:00",
  weekdayEnd: "01:00",
  sunholStart: "15:00",
  sunholEnd: "02:00",
};

describe("standardTimesFor", () => {
  it("Werktag → Werktagszeiten", () => {
    // 2026-01-05 = Montag
    expect(standardTimesFor("2026-01-05", S)).toEqual({ start: "17:00", end: "01:00" });
  });
  it("Sonntag → Sonn-/Feiertagszeiten", () => {
    // 2026-01-04 = Sonntag
    expect(standardTimesFor("2026-01-04", S)).toEqual({ start: "15:00", end: "02:00" });
  });
  it("bayerischer Feiertag unter der Woche (1. Mai) → sunhol", () => {
    // 2026-05-01 (Fr) — Tag der Arbeit
    expect(standardTimesFor("2026-05-01", S)).toEqual({ start: "15:00", end: "02:00" });
  });
  it("Fronleichnam → sunhol", () => {
    // 2026-06-04 = Do (Fronleichnam)
    expect(standardTimesFor("2026-06-04", S)).toEqual({ start: "15:00", end: "02:00" });
  });
});

describe("resolveBatchDay", () => {
  const base = {
    dateIso: "2026-01-05", // Mo
    isLocked: false,
    hasAbsence: false,
    otherLocationEntry: false,
  };
  it("skip locked", () => {
    expect(resolveBatchDay({ ...base, mode: "override", isLocked: true })).toEqual({
      action: "skip",
      reason: "locked",
    });
  });
  it("skip absence", () => {
    expect(resolveBatchDay({ ...base, mode: "create_daily", hasAbsence: true })).toEqual({
      action: "skip",
      reason: "absence",
    });
  });
  it("override: kein ownEntry → skip no-entry (erzeugt NICHT)", () => {
    expect(resolveBatchDay({ ...base, mode: "override" })).toEqual({
      action: "skip",
      reason: "no-entry",
    });
  });
  it("override: ownEntry ohne Times → skip no-entry", () => {
    expect(
      resolveBatchDay({
        ...base,
        mode: "override",
        ownEntry: { id: "e1", hasTimes: false },
      }),
    ).toEqual({ action: "skip", reason: "no-entry" });
  });
  it("override: ownEntry mit Times → update", () => {
    expect(
      resolveBatchDay({
        ...base,
        mode: "override",
        ownEntry: { id: "e1", hasTimes: true },
      }),
    ).toEqual({ action: "update", entryId: "e1" });
  });
  it("create_weekdays: Samstag → skip not-weekday", () => {
    expect(
      resolveBatchDay({ ...base, dateIso: "2026-01-03", mode: "create_weekdays" }),
    ).toEqual({ action: "skip", reason: "not-weekday" });
  });
  it("create_weekdays: Fremd-Standort → skip", () => {
    expect(
      resolveBatchDay({ ...base, mode: "create_weekdays", otherLocationEntry: true }),
    ).toEqual({ action: "skip", reason: "other-location" });
  });
  it("create_weekdays: leer → create", () => {
    expect(resolveBatchDay({ ...base, mode: "create_weekdays" })).toEqual({ action: "create" });
  });
  it("create_weekdays: ownEntry → update", () => {
    expect(
      resolveBatchDay({
        ...base,
        mode: "create_weekdays",
        ownEntry: { id: "e2", hasTimes: false },
      }),
    ).toEqual({ action: "update", entryId: "e2" });
  });
  it("create_daily: Sonntag → create (nicht not-weekday)", () => {
    expect(
      resolveBatchDay({ ...base, dateIso: "2026-01-04", mode: "create_daily" }),
    ).toEqual({ action: "create" });
  });
});

describe("batchTimestamps", () => {
  it("Mitternachts-Wrap 17→01 landet am Folgetag mit Pause 30", () => {
    const t = batchTimestamps("2026-01-05", "17:00", "01:00");
    // 8h brutto → >6h ≤9h → 30 min
    expect(t.breakMinutes).toBe(30);
    expect(t.startedAtIso.startsWith("2026-01-05T")).toBe(true);
    expect(t.endedAtIso.startsWith("2026-01-06T")).toBe(true);
  });
  it("Sonntag 15→02 landet am Folgetag mit Pause 45", () => {
    const t = batchTimestamps("2026-01-04", "15:00", "02:00");
    // 11h brutto → >9h → 45 min
    expect(t.breakMinutes).toBe(45);
    expect(t.endedAtIso.startsWith("2026-01-05T")).toBe(true);
  });
  it("kurze Schicht ≤6h: keine Pflicht-Pause", () => {
    const t = batchTimestamps("2026-01-05", "10:00", "16:00");
    expect(t.breakMinutes).toBe(0);
  });
});