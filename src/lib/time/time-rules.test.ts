import { describe, it, expect } from "vitest";
import { canClockIn, canClockOut } from "./time-rules";

describe("canClockIn", () => {
  it("erlaubt aktiven Mitarbeiter ohne offenen Eintrag", () => {
    expect(canClockIn({ staffIsActive: true, openEntry: null })).toEqual({ ok: true });
  });
  it("lehnt inaktiven Mitarbeiter ab", () => {
    const r = canClockIn({ staffIsActive: false, openEntry: null });
    expect(r).toEqual({ ok: false, reason: "staff_inactive" });
  });
  it("lehnt doppelten Einstempelversuch ab", () => {
    const r = canClockIn({
      staffIsActive: true,
      openEntry: { id: "x", startedAt: new Date() },
    });
    expect(r).toEqual({ ok: false, reason: "already_clocked_in" });
  });
});

describe("canClockOut", () => {
  it("erlaubt Ausstempeln bei offenem Eintrag und now > start", () => {
    const start = new Date("2026-06-12T10:00:00Z");
    const now = new Date("2026-06-12T12:00:00Z");
    expect(canClockOut({ openEntry: { id: "x", startedAt: start }, now })).toEqual({
      ok: true,
    });
  });
  it("lehnt Ausstempeln ohne offenen Eintrag ab", () => {
    const r = canClockOut({ openEntry: null, now: new Date() });
    expect(r).toEqual({ ok: false, reason: "no_open_entry" });
  });
  it("lehnt Ausstempeln vor Stempel-Beginn ab", () => {
    const start = new Date("2026-06-12T10:00:00Z");
    const now = new Date("2026-06-12T09:59:00Z");
    const r = canClockOut({ openEntry: { id: "x", startedAt: start }, now });
    expect(r).toEqual({ ok: false, reason: "end_before_start" });
  });
});