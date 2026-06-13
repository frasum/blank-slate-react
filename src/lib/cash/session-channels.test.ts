import { describe, expect, it } from "vitest";
import { aggregateChannelAmounts, buildDayInputFromAggregation } from "./session-channels";

describe("aggregateChannelAmounts — kind-basierte Aggregation", () => {
  it("Summiert je kind und liefert cardTotal aus Terminals", () => {
    const agg = aggregateChannelAmounts(
      [
        { kind: "pos", amountCents: 500_00 },
        { kind: "pos", amountCents: 100_00 },
        { kind: "delivery_souse", amountCents: 80_00 },
        { kind: "delivery_wolt", amountCents: 30_00 },
        { kind: "einladung", amountCents: 12_00 },
      ],
      [{ amountCents: 200_00 }, { amountCents: 50_00 }],
    );
    expect(agg.byKind.pos).toBe(600_00);
    expect(agg.byKind.delivery_souse).toBe(80_00);
    expect(agg.byKind.delivery_wolt).toBe(30_00);
    expect(agg.byKind.einladung).toBe(12_00);
    expect(agg.cardTotalCents).toBe(250_00);
  });

  it("Leere Listen → alle Buckets 0", () => {
    const agg = aggregateChannelAmounts([], []);
    expect(Object.values(agg.byKind).every((v) => v === 0)).toBe(true);
    expect(agg.cardTotalCents).toBe(0);
  });

  it("Verweigert nicht-ganzzahlige Beträge", () => {
    expect(() => aggregateChannelAmounts([{ kind: "pos", amountCents: 1.5 }], [])).toThrow(
      /integer cents/,
    );
  });

  it("buildDayInputFromAggregation mappt Buckets auf DayInput-Felder", () => {
    const agg = aggregateChannelAmounts(
      [
        { kind: "pos", amountCents: 100_00 },
        { kind: "delivery_souse", amountCents: 20_00 },
      ],
      [{ amountCents: 50_00 }],
    );
    const partial = buildDayInputFromAggregation(agg);
    expect(partial.grossRevenueCents).toBe(100_00);
    expect(partial.deliverySouseCents).toBe(20_00);
    expect(partial.cardTotalCents).toBe(50_00);
  });
});