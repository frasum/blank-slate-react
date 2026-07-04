import { describe, it, expect } from "vitest";
import {
  canOfferShift,
  eligiblePeerFilter,
  canAcceptCounterShift,
  type SwapPeer,
  type SwapShift,
  type SwapArea,
} from "./swap-rules";

const TODAY = "2026-07-04";
const TOMORROW = "2026-07-05";
const YESTERDAY = "2026-07-03";

function shift(overrides: Partial<SwapShift> = {}): SwapShift {
  return {
    id: "s1",
    staffId: "requester",
    locationId: "L1",
    area: "service",
    shiftDate: TOMORROW,
    ...overrides,
  };
}

function peer(overrides: Partial<SwapPeer> = {}): SwapPeer {
  return {
    staffId: "peer-1",
    isActive: true,
    scopes: [{ locationId: "L1", area: "service" }],
    shiftDatesAtScope: new Set<string>(),
    ...overrides,
  };
}

describe("canOfferShift", () => {
  it("erlaubt Zukunfts-Schicht ohne aktive Anfrage", () => {
    expect(canOfferShift({ shiftDate: TOMORROW, todayIso: TODAY, hasActiveRequest: false })).toBe(
      true,
    );
  });
  it("verbietet Vergangenheit", () => {
    expect(canOfferShift({ shiftDate: YESTERDAY, todayIso: TODAY, hasActiveRequest: false })).toBe(
      false,
    );
  });
  it("verbietet heutigen Tag (>=morgen erforderlich)", () => {
    expect(canOfferShift({ shiftDate: TODAY, todayIso: TODAY, hasActiveRequest: false })).toBe(
      false,
    );
  });
  it("verbietet Doppel-Anfrage", () => {
    expect(canOfferShift({ shiftDate: TOMORROW, todayIso: TODAY, hasActiveRequest: true })).toBe(
      false,
    );
  });
});

describe("eligiblePeerFilter", () => {
  it("Standard: passt", () => {
    expect(eligiblePeerFilter({ peer: peer(), shift: shift() })).toBe(true);
  });
  it("verbietet den Anfragenden selbst", () => {
    expect(eligiblePeerFilter({ peer: peer({ staffId: "requester" }), shift: shift() })).toBe(
      false,
    );
  });
  it("verbietet inaktive Kollegen", () => {
    expect(eligiblePeerFilter({ peer: peer({ isActive: false }), shift: shift() })).toBe(false);
  });
  it("verbietet fremden Standort", () => {
    expect(
      eligiblePeerFilter({
        peer: peer({ scopes: [{ locationId: "L2", area: "service" }] }),
        shift: shift(),
      }),
    ).toBe(false);
  });
  it("verbietet fremden Bereich", () => {
    expect(
      eligiblePeerFilter({
        peer: peer({ scopes: [{ locationId: "L1", area: "kitchen" }] }),
        shift: shift(),
      }),
    ).toBe(false);
  });
  it("GL verhält sich wie jeder andere Bereich (passend => passt)", () => {
    expect(
      eligiblePeerFilter({
        peer: peer({ scopes: [{ locationId: "L1", area: "gl" }] }),
        shift: shift({ area: "gl" as SwapArea }),
      }),
    ).toBe(true);
  });
  it("verbietet Tages-Konflikt (Peer hat schon Schicht an dem Tag)", () => {
    expect(
      eligiblePeerFilter({
        peer: peer({ shiftDatesAtScope: new Set([TOMORROW]) }),
        shift: shift(),
      }),
    ).toBe(false);
  });
});

describe("canAcceptCounterShift", () => {
  const req = shift({ id: "req" });
  it("passt bei gleichem Scope, Zukunft, ohne aktive Anfrage", () => {
    expect(
      canAcceptCounterShift({
        counterShift: {
          id: "c",
          staffId: "peer-1",
          locationId: "L1",
          area: "service",
          shiftDate: TOMORROW,
          hasActiveRequest: false,
        },
        requestShift: req,
        peerStaffId: "peer-1",
        todayIso: TODAY,
      }),
    ).toBe(true);
  });
  it("verbietet fremde Schicht (nicht Peer-eigen)", () => {
    expect(
      canAcceptCounterShift({
        counterShift: {
          id: "c",
          staffId: "anderer",
          locationId: "L1",
          area: "service",
          shiftDate: TOMORROW,
          hasActiveRequest: false,
        },
        requestShift: req,
        peerStaffId: "peer-1",
        todayIso: TODAY,
      }),
    ).toBe(false);
  });
  it("verbietet anderen Standort/Bereich", () => {
    expect(
      canAcceptCounterShift({
        counterShift: {
          id: "c",
          staffId: "peer-1",
          locationId: "L2",
          area: "service",
          shiftDate: TOMORROW,
          hasActiveRequest: false,
        },
        requestShift: req,
        peerStaffId: "peer-1",
        todayIso: TODAY,
      }),
    ).toBe(false);
  });
  it("verbietet Vergangenheit", () => {
    expect(
      canAcceptCounterShift({
        counterShift: {
          id: "c",
          staffId: "peer-1",
          locationId: "L1",
          area: "service",
          shiftDate: YESTERDAY,
          hasActiveRequest: false,
        },
        requestShift: req,
        peerStaffId: "peer-1",
        todayIso: TODAY,
      }),
    ).toBe(false);
  });
  it("verbietet Gegentausch-Schicht mit eigener aktiver Anfrage", () => {
    expect(
      canAcceptCounterShift({
        counterShift: {
          id: "c",
          staffId: "peer-1",
          locationId: "L1",
          area: "service",
          shiftDate: TOMORROW,
          hasActiveRequest: true,
        },
        requestShift: req,
        peerStaffId: "peer-1",
        todayIso: TODAY,
      }),
    ).toBe(false);
  });
});
