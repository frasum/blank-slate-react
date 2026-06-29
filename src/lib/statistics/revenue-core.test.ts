import { describe, it, expect } from "vitest";
import {
  sessionRevenue,
  aggregateByBusinessDate,
  summarize,
  computeTrend,
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
        sessionCount: 1,
      },
      {
        businessDate: "2026-06-02",
        houseCents: 0,
        takeawayCents: 0,
        totalCents: 0,
        sessionCount: 1,
      },
      {
        businessDate: "2026-06-03",
        houseCents: 200,
        takeawayCents: 0,
        totalCents: 200,
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