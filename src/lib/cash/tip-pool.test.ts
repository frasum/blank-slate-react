import { describe, expect, it } from "vitest";
import { computeTipPool } from "./tip-pool";

function iso(h: number, m = 0): string {
  const d = new Date("2025-06-01T00:00:00Z");
  d.setUTCHours(h, m, 0, 0);
  return d.toISOString();
}

const participatesAll = (ids: string[]) => new Map(ids.map((id) => [id, true]));

describe("computeTipPool", () => {
  it("(a) Normalfall: 2 Küche + 2 Service mit unterschiedlichen Stunden", () => {
    const r = computeTipPool({
      kitchenPoolCents: 10_000,
      servicePoolCents: 30_000,
      settlements: [],
      timeEntries: [
        { staffId: "k1", startedAt: iso(10), endedAt: iso(18) }, // 8h
        { staffId: "k2", startedAt: iso(14), endedAt: iso(18) }, // 4h
        { staffId: "s1", startedAt: iso(10), endedAt: iso(20) }, // 10h
        { staffId: "s2", startedAt: iso(15), endedAt: iso(20) }, // 5h
      ],
      staffDepartments: new Map([
        ["k1", "kitchen"],
        ["k2", "kitchen"],
        ["s1", "service"],
        ["s2", "service"],
      ]),
      staffParticipates: participatesAll(["k1", "k2", "s1", "s2"]),
    });
    const byId = new Map(r.shares.map((s) => [s.staffId, s]));
    expect(byId.get("k1")!.shareCents).toBe(Math.floor((10_000 * 8) / 12));
    expect(byId.get("k2")!.shareCents).toBe(Math.floor((10_000 * 4) / 12));
    expect(byId.get("s1")!.shareCents).toBe(Math.floor((30_000 * 10) / 15));
    expect(byId.get("s2")!.shareCents).toBe(Math.floor((30_000 * 5) / 15));
  });

  it("(b) Rundungsrest bleibt im Pool", () => {
    const r = computeTipPool({
      kitchenPoolCents: 100,
      servicePoolCents: 0,
      settlements: [],
      timeEntries: [
        { staffId: "k1", startedAt: iso(10), endedAt: iso(11) },
        { staffId: "k2", startedAt: iso(10), endedAt: iso(11) },
        { staffId: "k3", startedAt: iso(10), endedAt: iso(11) },
      ],
      staffDepartments: new Map([
        ["k1", "kitchen"],
        ["k2", "kitchen"],
        ["k3", "kitchen"],
      ]),
      staffParticipates: participatesAll(["k1", "k2", "k3"]),
    });
    const sum = r.shares.reduce((s, x) => s + x.shareCents, 0);
    expect(sum).toBe(99);
    expect(r.kitchenRemainder).toBe(1);
    expect(sum + r.kitchenRemainder).toBe(100);
  });

  it("(c) participates_in_pool=false wird ausgeschlossen", () => {
    const r = computeTipPool({
      kitchenPoolCents: 1_000,
      servicePoolCents: 0,
      settlements: [],
      timeEntries: [
        { staffId: "k1", startedAt: iso(10), endedAt: iso(15) },
        { staffId: "k2", startedAt: iso(10), endedAt: iso(15) },
      ],
      staffDepartments: new Map<string, "kitchen" | "service" | "gl">([
        ["k1", "kitchen"],
        ["k2", "kitchen"],
      ]),
      staffParticipates: new Map([
        ["k1", true],
        ["k2", false],
      ]),
    });
    expect(r.shares).toHaveLength(1);
    expect(r.shares[0]).toMatchObject({ staffId: "k1", shareCents: 1_000 });
  });

  it("(d) GL ist aus beiden Pools ausgeschlossen", () => {
    const r = computeTipPool({
      kitchenPoolCents: 500,
      servicePoolCents: 500,
      settlements: [],
      timeEntries: [
        { staffId: "gl1", startedAt: iso(10), endedAt: iso(20) },
        { staffId: "s1", startedAt: iso(10), endedAt: iso(15) },
        { staffId: "k1", startedAt: iso(10), endedAt: iso(15) },
      ],
      staffDepartments: new Map<string, "kitchen" | "service" | "gl">([
        ["gl1", "gl"],
        ["s1", "service"],
        ["k1", "kitchen"],
      ]),
      staffParticipates: participatesAll(["gl1", "s1", "k1"]),
    });
    expect(r.shares.find((s) => s.staffId === "gl1")).toBeUndefined();
    expect(r.shares.find((s) => s.staffId === "k1")!.shareCents).toBe(500);
    expect(r.shares.find((s) => s.staffId === "s1")!.shareCents).toBe(500);
  });

  it("(e) leere time_entries → alle shares 0, Reste = Pool-Summen", () => {
    const r = computeTipPool({
      kitchenPoolCents: 1_234,
      servicePoolCents: 5_678,
      settlements: [
        {
          staffId: "s1",
          posSalesCents: 0,
          cardTotalCents: 0,
          openInvoicesCents: 0,
          kitchenTipCents: 0,
        },
      ],
      timeEntries: [],
      staffDepartments: new Map([["s1", "service"]]),
      staffParticipates: new Map([["s1", true]]),
    });
    expect(r.shares.every((x) => x.shareCents === 0)).toBe(true);
    expect(r.kitchenRemainder).toBe(1_234);
    expect(r.serviceRemainder).toBe(5_678);
  });
});
