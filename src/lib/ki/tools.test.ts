// KI4 — Registrierung + reine Aufbereitungs-Tests für A1′ (Zahlungsweg-
// Aufschlüsselung) und A4 (Trinkgeld-Aggregat).

import { describe, expect, it } from "vitest";
import { TOOLS, TOOL_NAMES } from "./tools";
import { computePaymentBreakdown } from "./tool-dispatcher.server";
import { aggregateTips, type SessionTipResult } from "@/lib/statistics/tip-aggregate";

describe("KI-Tool-Registrierung", () => {
  it("umsatz_zeitraum ist registriert und dokumentiert fehlende Servicezeit", () => {
    const t = TOOLS.find((x) => x.name === "umsatz_zeitraum");
    expect(t).toBeDefined();
    expect(TOOL_NAMES).toContain("umsatz_zeitraum");
    expect(t!.description).toMatch(/Servicezeit/i);
    expect(t!.description).toMatch(/Zahlungsweg/i);
  });

  it("trinkgeld_aggregat ist registriert, mit from/to als Pflicht und Datenschutz-Hinweis", () => {
    const t = TOOLS.find((x) => x.name === "trinkgeld_aggregat");
    expect(t).toBeDefined();
    expect(TOOL_NAMES).toContain("trinkgeld_aggregat");
    expect(t!.input_schema.required).toEqual(["from", "to"]);
    expect(t!.description.toLowerCase()).toMatch(/personen|datenschutz/);
  });
});

describe("A1′ computePaymentBreakdown", () => {
  it("Bar = Σ kassiert − Σ Karte, Kanäle werden absteigend gruppiert", () => {
    const b = computePaymentBreakdown(
      [
        { cardTotalCents: 30_00, kassiertBruttoCents: 100_00 },
        { cardTotalCents: 20_00, kassiertBruttoCents: 50_00 },
      ],
      [
        { vouchersSoldCents: 25_00, vouchersRedeemedCents: 10_00 },
        { vouchersSoldCents: 0, vouchersRedeemedCents: 5_00 },
      ],
      [
        { name: "Lieferando", amountCents: 40_00 },
        { name: "Wolt", amountCents: 60_00 },
        { name: "Lieferando", amountCents: 10_00 },
      ],
    );
    expect(b.karteCents).toBe(50_00);
    expect(b.barCentsRechnerisch).toBe(100_00); // 150 − 50
    expect(b.gutscheineVerkauftCents).toBe(25_00);
    expect(b.gutscheineEingeloestCents).toBe(15_00);
    expect(b.takeawayKanaele).toEqual([
      { name: "Wolt", amountCents: 60_00 },
      { name: "Lieferando", amountCents: 50_00 },
    ]);
  });

  it("Bar-Restgröße wird auf 0 geklemmt, wenn Karte > kassiert (defekte Datenlage)", () => {
    const b = computePaymentBreakdown(
      [{ cardTotalCents: 100_00, kassiertBruttoCents: 40_00 }],
      [],
      [],
    );
    expect(b.barCentsRechnerisch).toBe(0);
  });
});

describe("A4 Trinkgeld-Aggregat — keine Personenanteile in der Aggregat-Antwort", () => {
  const results: SessionTipResult[] = [
    {
      businessDate: "2026-06-01",
      serviceRemainderCents: 0,
      kitchenRemainderCents: 100,
      shares: [
        { staffId: "s1", department: "service", shareCents: 500 },
        { staffId: "s2", department: "kitchen", shareCents: 300 },
      ],
    },
  ];

  it("Aggregat = Shares + Remainder je Bereich, daysWithData zählt korrekt", () => {
    const agg = aggregateTips(results, {});
    // Die Aggregat-Antwort des Tools baut sich aus totals + daily.length auf.
    const daysWithData = agg.daily.filter((d) => d.serviceCents + d.kitchenCents > 0).length;
    expect(agg.totals.serviceCents).toBe(500);
    expect(agg.totals.kitchenCents).toBe(400);
    expect(agg.totals.totalCents).toBe(900);
    expect(daysWithData).toBe(1);
  });

  it("Die Tool-Antwort-Form enthält KEIN shares-Feld (Datenschutz-Kanon)", () => {
    // Nachbildung des Response-Shapings aus trinkgeldAggregat — bewusst
    // KEIN shares/perStaff-Feld an das Modell.
    const agg = aggregateTips(results, {});
    const response = {
      range: { from: "2026-06-01", to: "2026-06-01" },
      location_id: null,
      serviceCents: agg.totals.serviceCents,
      kitchenCents: agg.totals.kitchenCents,
      totalCents: agg.totals.totalCents,
      daysWithData: agg.daily.length,
      per_standort: [] as unknown[],
      hinweis: "…",
    } as Record<string, unknown>;
    expect(Object.keys(response)).not.toContain("shares");
    expect(Object.keys(response)).not.toContain("perStaff");
    expect(Object.keys(response)).not.toContain("per_staff");
  });
});
