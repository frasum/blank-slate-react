import { describe, it, expect } from "vitest";
import {
  sessionRevenue,
  aggregateByBusinessDate,
  summarize,
  computeTrend,
  groupTakeawayByChannel,
  computeChannelPercents,
  type SessionRevenueInput,
} from "./revenue-core";

describe("sessionRevenue", () => {
  it("YUM-Stil: vectron + ein Takeaway-Kanal, keine Nicht-Takeaway-Kanäle", () => {
    const input: SessionRevenueInput = {
      sessionId: "s1",
      businessDate: "2026-06-01",
      locationId: "yum",
      vectronCents: 551830,
      channels: [{ amountCents: 58550, isTakeaway: true }],
    };
    expect(sessionRevenue(input)).toEqual({
      houseCents: 551830,
      takeawayCents: 58550,
      totalCents: 610380,
    });
  });

  // TSB-Stil: dokumentiert das „eine-Quelle"-Verhalten der reinen Funktion.
  // OFFENE VERIFIKATION: ob TSB in der Realität vectronCents UND den
  // pos-Kanal „Kasse" gleichzeitig füllt — wenn ja, muss die Server-Fn
  // das auflösen, nicht diese reine Funktion.
  it("TSB-Stil: Nicht-Takeaway-Kanal + Takeaway-Kanal, vectron=0", () => {
    const input: SessionRevenueInput = {
      sessionId: "s2",
      businessDate: "2026-06-01",
      locationId: "tsb",
      vectronCents: 0,
      channels: [
        { amountCents: 200000, isTakeaway: false }, // Kasse
        { amountCents: 50000, isTakeaway: true }, // Wolt
      ],
    };
    expect(sessionRevenue(input)).toEqual({
      houseCents: 200000,
      takeawayCents: 50000,
      totalCents: 250000,
    });
  });

  it("leere Kanäle: nur vectron", () => {
    expect(
      sessionRevenue({
        sessionId: "s3",
        businessDate: "2026-06-01",
        locationId: "x",
        vectronCents: 12345,
        channels: [],
      }),
    ).toEqual({ houseCents: 12345, takeawayCents: 0, totalCents: 12345 });
  });
});

describe("aggregateByBusinessDate", () => {
  it("zwei Sessions am selben Tag (zwei Standorte) summieren zu einer Tageszeile", () => {
    const sessions: SessionRevenueInput[] = [
      {
        sessionId: "a",
        businessDate: "2026-06-01",
        locationId: "yum",
        vectronCents: 100000,
        channels: [{ amountCents: 20000, isTakeaway: true }],
      },
      {
        sessionId: "b",
        businessDate: "2026-06-01",
        locationId: "spicery",
        vectronCents: 50000,
        channels: [{ amountCents: 10000, isTakeaway: true }],
      },
    ];
    expect(aggregateByBusinessDate(sessions)).toEqual([
      {
        businessDate: "2026-06-01",
        houseCents: 150000,
        takeawayCents: 30000,
        totalCents: 180000,
        cardCents: 0,
        sessionCount: 2,
      },
    ]);
  });

  it("sortiert mehrere Tage aufsteigend", () => {
    const sessions: SessionRevenueInput[] = [
      {
        sessionId: "c",
        businessDate: "2026-06-03",
        locationId: "x",
        vectronCents: 300,
        channels: [],
      },
      {
        sessionId: "a",
        businessDate: "2026-06-01",
        locationId: "x",
        vectronCents: 100,
        channels: [],
      },
      {
        sessionId: "b",
        businessDate: "2026-06-02",
        locationId: "x",
        vectronCents: 200,
        channels: [],
      },
    ];
    expect(aggregateByBusinessDate(sessions).map((d) => d.businessDate)).toEqual([
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
    ]);
  });
});

describe("summarize", () => {
  it("summiert und zählt nur Tage mit totalCents > 0", () => {
    const res = summarize([
      {
        businessDate: "2026-06-01",
        houseCents: 100,
        takeawayCents: 50,
        totalCents: 150,
        cardCents: 0,
        sessionCount: 1,
      },
      {
        businessDate: "2026-06-02",
        houseCents: 0,
        takeawayCents: 0,
        totalCents: 0,
        cardCents: 0,
        sessionCount: 1,
      },
      {
        businessDate: "2026-06-03",
        houseCents: 200,
        takeawayCents: 0,
        totalCents: 200,
        cardCents: 0,
        sessionCount: 1,
      },
    ]);
    expect(res).toEqual({
      houseCents: 300,
      takeawayCents: 50,
      totalCents: 350,
      daysWithRevenue: 2,
    });
  });

  it("leere Liste", () => {
    expect(summarize([])).toEqual({
      houseCents: 0,
      takeawayCents: 0,
      totalCents: 0,
      daysWithRevenue: 0,
    });
  });
});

describe("computeTrend", () => {
  it("positiver Trend", () => {
    expect(computeTrend(150, 100)).toEqual({ deltaCents: 50, pct: 50 });
  });
  it("negativer Trend", () => {
    expect(computeTrend(80, 100)).toEqual({ deltaCents: -20, pct: -20 });
  });
  it("previous=0 → pct=null (kein willkürliches 100 %)", () => {
    expect(computeTrend(500, 0)).toEqual({ deltaCents: 500, pct: null });
  });
  it("current===previous → delta 0, pct 0", () => {
    expect(computeTrend(100, 100)).toEqual({ deltaCents: 0, pct: 0 });
  });
});

describe("aggregateByBusinessDate — cardCents", () => {
  it("ohne Card-Map → cardCents = 0", () => {
    const rows = aggregateByBusinessDate([
      {
        sessionId: "a",
        businessDate: "2026-06-01",
        locationId: "x",
        vectronCents: 1000,
        channels: [],
      },
    ]);
    expect(rows[0].cardCents).toBe(0);
  });
  it("Map summiert Card pro Session und mergt pro Tag", () => {
    const rows = aggregateByBusinessDate(
      [
        {
          sessionId: "a",
          businessDate: "2026-06-01",
          locationId: "x",
          vectronCents: 100,
          channels: [],
        },
        {
          sessionId: "b",
          businessDate: "2026-06-01",
          locationId: "y",
          vectronCents: 200,
          channels: [],
        },
      ],
      new Map([
        ["a", 400],
        ["b", 600],
      ]),
    );
    expect(rows[0].cardCents).toBe(1000);
  });
  it("Record-Form (Session ohne Eintrag = 0)", () => {
    const rows = aggregateByBusinessDate(
      [
        {
          sessionId: "a",
          businessDate: "2026-06-01",
          locationId: "x",
          vectronCents: 100,
          channels: [],
        },
      ],
      { b: 999 },
    );
    expect(rows[0].cardCents).toBe(0);
  });
});

describe("groupTakeawayByChannel", () => {
  it("summiert je Name und sortiert absteigend", () => {
    const out = groupTakeawayByChannel([
      { name: "Wolt", amountCents: 1000 },
      { name: "SoUse", amountCents: 500 },
      { name: "Wolt", amountCents: 250 },
    ]);
    expect(out).toEqual([
      { name: "Wolt", amountCents: 1250 },
      { name: "SoUse", amountCents: 500 },
    ]);
  });
  it("leere Liste", () => {
    expect(groupTakeawayByChannel([])).toEqual([]);
  });
});

describe("computeChannelPercents", () => {
  it("Σ pct = 100 auch bei 1/3-Kanten", () => {
    const out = computeChannelPercents([
      { name: "A", amountCents: 100 },
      { name: "B", amountCents: 100 },
      { name: "C", amountCents: 100 },
    ]);
    expect(out.reduce((s, i) => s + i.pct, 0)).toBe(100);
    expect(out.map((i) => i.pct).sort()).toEqual([33, 33, 34]);
  });
  it("exakte Aufteilung", () => {
    const out = computeChannelPercents([
      { name: "A", amountCents: 250 },
      { name: "B", amountCents: 750 },
    ]);
    expect(out).toEqual([
      { name: "A", amountCents: 250, pct: 25 },
      { name: "B", amountCents: 750, pct: 75 },
    ]);
  });
  it("leere Liste", () => {
    expect(computeChannelPercents([])).toEqual([]);
  });
  it("Gesamtsumme 0 → alle pct=0", () => {
    const out = computeChannelPercents([
      { name: "A", amountCents: 0 },
      { name: "B", amountCents: 0 },
    ]);
    expect(out.every((i) => i.pct === 0)).toBe(true);
  });
});
