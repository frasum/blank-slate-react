import { describe, expect, it, test } from "vitest";
import { computeTipPool, computeTipTotalCents } from "./tip-pool";

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

test("computeTipTotalCents: echtes Trinkgeld (26.04. YUM)", () => {
  const total = computeTipTotalCents([
    {
      cardTotalCents: 198608,
      cashHandedInCents: 34700,
      posSalesCents: 215400,
      openInvoicesCents: 0,
    }, // KRISS
    { cardTotalCents: 50666, cashHandedInCents: 23000, posSalesCents: 68330, openInvoicesCents: 0 }, // JASMIN
    { cardTotalCents: 0, cashHandedInCents: 6000, posSalesCents: 5780, openInvoicesCents: 0 }, // TU
  ]);
  expect(total).toBe(23464);
  expect(total - 5791).toBe(17673);
});

describe("computeTipPool: Mindeststunden", () => {
  it("schließt Mitarbeiter unter Grenze aus und nimmt 2:30 inklusiv mit", () => {
    const r = computeTipPool({
      kitchenPoolCents: 0,
      servicePoolCents: 10_000,
      settlements: [],
      timeEntries: [
        // s1: exakt 2:30 → muss mitmachen
        { staffId: "s1", startedAt: iso(17, 0), endedAt: iso(19, 30) },
        // s2: 2:29 → ausgeschlossen
        { staffId: "s2", startedAt: iso(17, 0), endedAt: iso(19, 29) },
        // s3: 5h → mitmachen
        { staffId: "s3", startedAt: iso(15), endedAt: iso(20) },
      ],
      staffDepartments: new Map<string, "kitchen" | "service" | "gl">([
        ["s1", "service"],
        ["s2", "service"],
        ["s3", "service"],
      ]),
      staffParticipates: participatesAll(["s1", "s2", "s3"]),
      minHoursPerDay: 2.5,
    });
    const ids = r.shares.map((s) => s.staffId).sort();
    expect(ids).toEqual(["s1", "s3"]);
    expect(r.excludedByMinHours).toHaveLength(1);
    expect(r.excludedByMinHours[0]).toMatchObject({ staffId: "s2", department: "service" });
  });

  it("Tagessumme zählt: mehrere Stempelungen werden summiert", () => {
    const r = computeTipPool({
      kitchenPoolCents: 0,
      servicePoolCents: 1_000,
      settlements: [],
      timeEntries: [
        // 1,5 h + 1,5 h = 3 h → mitmachen (Tagessumme)
        { staffId: "y", startedAt: iso(11, 0), endedAt: iso(12, 30) },
        { staffId: "y", startedAt: iso(17, 30), endedAt: iso(19, 0) },
      ],
      staffDepartments: new Map<string, "kitchen" | "service" | "gl">([["y", "service"]]),
      staffParticipates: participatesAll(["y"]),
      minHoursPerDay: 2.5,
    });
    expect(r.shares).toHaveLength(1);
    expect(r.shares[0].staffId).toBe("y");
    expect(r.excludedByMinHours).toHaveLength(0);
  });

  it("minHoursPerDay=0 oder undefined: keine Filterung", () => {
    const base = {
      kitchenPoolCents: 0,
      servicePoolCents: 100,
      settlements: [],
      timeEntries: [{ staffId: "s1", startedAt: iso(17, 0), endedAt: iso(17, 30) }],
      staffDepartments: new Map<string, "kitchen" | "service" | "gl">([["s1", "service"]]),
      staffParticipates: participatesAll(["s1"]),
    };
    expect(computeTipPool({ ...base }).shares).toHaveLength(1);
    expect(computeTipPool({ ...base, minHoursPerDay: 0 }).shares).toHaveLength(1);
  });
});
