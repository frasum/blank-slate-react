import { describe, it, expect } from "vitest";
import {
  canOfferShift,
  eligiblePeerFilter,
  canAcceptCounterShift,
  type SwapShiftShape,
  type SwapPeerShape,
} from "./swap-rules";

const TODAY = "2026-07-04";
const FUTURE = "2026-07-10";
const PAST = "2026-07-03";

function shift(overrides: Partial<SwapShiftShape> = {}): SwapShiftShape {
  return {
    id: "s1",
    staffId: "A",
    locationId: "L1",
    area: "service",
    shiftDate: FUTURE,
    ...overrides,
  };
}

function peer(overrides: Partial<SwapPeerShape> = {}): SwapPeerShape {
  return {
    staffId: "B",
    isActive: true,
    locations: [{ locationId: "L1", area: "service" }],
    shiftsOnDate: [],
    ...overrides,
  };
}

describe("canOfferShift", () => {
  it("erlaubt zukünftige Schicht ohne aktive Anfrage", () => {
    expect(canOfferShift({ shiftDate: FUTURE, todayIso: TODAY, hasActiveRequest: false })).toEqual({
      ok: true,
    });
  });
  it("lehnt Vergangenheit ab", () => {
    const r = canOfferShift({ shiftDate: PAST, todayIso: TODAY, hasActiveRequest: false });
    expect(r.ok).toBe(false);
  });
  it("lehnt heute ab (nur ab morgen)", () => {
    const r = canOfferShift({ shiftDate: TODAY, todayIso: TODAY, hasActiveRequest: false });
    expect(r.ok).toBe(false);
  });
  it("lehnt doppelte Anfrage ab", () => {
    const r = canOfferShift({ shiftDate: FUTURE, todayIso: TODAY, hasActiveRequest: true });
    expect(r.ok).toBe(false);
  });
});

describe("eligiblePeerFilter", () => {
  it("berechtigt: gleicher Standort + Bereich, aktiv, kein Tageskonflikt", () => {
    expect(eligiblePeerFilter({ peer: peer(), shift: shift() })).toBe(true);
  });
  it("lehnt inaktiven Kollegen ab", () => {
    expect(eligiblePeerFilter({ peer: peer({ isActive: false }), shift: shift() })).toBe(false);
  });
  it("lehnt Anfragenden selbst ab", () => {
    expect(eligiblePeerFilter({ peer: peer({ staffId: "A" }), shift: shift() })).toBe(false);
  });
  it("lehnt fremden Standort ab", () => {
    expect(
      eligiblePeerFilter({
        peer: peer({ locations: [{ locationId: "L2", area: "service" }] }),
        shift: shift(),
      }),
    ).toBe(false);
  });
  it("lehnt fremden Bereich ab", () => {
    expect(
      eligiblePeerFilter({
        peer: peer({ locations: [{ locationId: "L1", area: "kitchen" }] }),
        shift: shift(),
      }),
    ).toBe(false);
  });
  it("lehnt Tages-Konflikt am gleichen Ort+Bereich ab", () => {
    expect(
      eligiblePeerFilter({
        peer: peer({ shiftsOnDate: [{ locationId: "L1", area: "service" }] }),
        shift: shift(),
      }),
    ).toBe(false);
  });
  it("erlaubt Kollege mit Schicht am gleichen Tag in anderem Bereich", () => {
    expect(
      eligiblePeerFilter({
        peer: peer({ shiftsOnDate: [{ locationId: "L1", area: "kitchen" }] }),
        shift: shift(),
      }),
    ).toBe(true);
  });
  it("behandelt gl wie jeden anderen Bereich", () => {
    expect(
      eligiblePeerFilter({
        peer: peer({ locations: [{ locationId: "L1", area: "gl" }] }),
        shift: shift({ area: "gl" }),
      }),
    ).toBe(true);
    expect(
      eligiblePeerFilter({
        peer: peer({ locations: [{ locationId: "L1", area: "service" }] }),
        shift: shift({ area: "gl" }),
      }),
    ).toBe(false);
  });
});

describe("canAcceptCounterShift", () => {
  const req = shift();
  it("akzeptiert passenden Gegentausch", () => {
    const r = canAcceptCounterShift({
      counterShift: shift({ id: "s2", staffId: "B", shiftDate: "2026-07-12" }),
      requestShift: req,
      peerStaffId: "B",
      todayIso: TODAY,
      counterHasActiveRequest: false,
    });
    expect(r.ok).toBe(true);
  });
  it("lehnt fremde Schicht ab", () => {
    const r = canAcceptCounterShift({
      counterShift: shift({ id: "s2", staffId: "C", shiftDate: "2026-07-12" }),
      requestShift: req,
      peerStaffId: "B",
      todayIso: TODAY,
      counterHasActiveRequest: false,
    });
    expect(r.ok).toBe(false);
  });
  it("lehnt anderen Standort ab", () => {
    const r = canAcceptCounterShift({
      counterShift: shift({ id: "s2", staffId: "B", locationId: "L2", shiftDate: "2026-07-12" }),
      requestShift: req,
      peerStaffId: "B",
      todayIso: TODAY,
      counterHasActiveRequest: false,
    });
    expect(r.ok).toBe(false);
  });
  it("lehnt anderen Bereich ab", () => {
    const r = canAcceptCounterShift({
      counterShift: shift({ id: "s2", staffId: "B", area: "kitchen", shiftDate: "2026-07-12" }),
      requestShift: req,
      peerStaffId: "B",
      todayIso: TODAY,
      counterHasActiveRequest: false,
    });
    expect(r.ok).toBe(false);
  });
  it("lehnt Vergangenheit ab", () => {
    const r = canAcceptCounterShift({
      counterShift: shift({ id: "s2", staffId: "B", shiftDate: PAST }),
      requestShift: req,
      peerStaffId: "B",
      todayIso: TODAY,
      counterHasActiveRequest: false,
    });
    expect(r.ok).toBe(false);
  });
  it("lehnt bereits vergebene Gegentausch-Schicht ab", () => {
    const r = canAcceptCounterShift({
      counterShift: shift({ id: "s2", staffId: "B", shiftDate: "2026-07-12" }),
      requestShift: req,
      peerStaffId: "B",
      todayIso: TODAY,
      counterHasActiveRequest: true,
    });
    expect(r.ok).toBe(false);
  });
});
