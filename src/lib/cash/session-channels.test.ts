import { describe, expect, it } from "vitest";
import {
  aggregateChannelAmounts,
  buildDayInputFromAggregation,
  sumNonGlTerminalCents,
  cardDeductionFromTerminalRows,
} from "./session-channels";
import { parseEuroToCents } from "@/lib/cash/kasse-helpers";

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

describe("sumNonGlTerminalCents — GL-Terminals dürfen Bargeld nicht mindern", () => {
  it("Summiert nur physische Terminals (GL wird übersprungen)", () => {
    const sum = sumNonGlTerminalCents([
      { amountCents: 100_00, isGl: false },
      { amountCents: 24_80, isGl: true },
    ]);
    expect(sum).toBe(100_00);
  });

  it("Leere Liste → 0", () => {
    expect(sumNonGlTerminalCents([])).toBe(0);
  });

  it("Verweigert nicht-ganzzahlige Beträge", () => {
    expect(() => sumNonGlTerminalCents([{ amountCents: 1.5, isGl: false }])).toThrow(
      /integer cents/,
    );
  });
});

describe("cardDeductionFromTerminalRows — §33 auf Formularzeilen", () => {
  it("Summiert nur nicht-GL-Zeilen (T1 + T2 + GL 27,80 → 605164)", () => {
    const sum = cardDeductionFromTerminalRows(
      [
        { euro: "6051,64", isGl: false },
        { euro: "0", isGl: false },
        { euro: "27,80", isGl: true },
      ],
      parseEuroToCents,
    );
    expect(sum).toBe(605164);
  });
  it("Nur GL-Zeilen → 0", () => {
    expect(
      cardDeductionFromTerminalRows(
        [
          { euro: "10,00", isGl: true },
          { euro: "5,00", isGl: true },
        ],
        parseEuroToCents,
      ),
    ).toBe(0);
  });
  it("Unparsebare Eingabe zählt als 0", () => {
    expect(cardDeductionFromTerminalRows([{ euro: "abc", isGl: false }], parseEuroToCents)).toBe(0);
  });
  it("Leere Liste → 0", () => {
    expect(cardDeductionFromTerminalRows([], parseEuroToCents)).toBe(0);
  });
});
