import { describe, expect, it } from "vitest";
import type {
  DisplayBlock,
  DisplayCell,
  DisplayPeriodBlocks,
} from "@/lib/display/display-data.server";
import { buildRosterGrid, cellMarker, EMPTY_MARKER } from "./roster-grid";

function cell(k: DisplayCell["k"], skill: string | null = null): DisplayCell {
  return { k, skill, color: null };
}

function makeBlock(
  area: "service" | "kitchen",
  rows: Array<{ staffId: string; staffName: string; cells: DisplayCell[] }>,
): DisplayBlock {
  return {
    area,
    title: area === "service" ? "Service" : "Küche",
    rows: rows.map((r) => ({
      ...r,
      shiftCountCurrent: 0,
      shiftCountNext: 0,
    })),
    dayCounts: [],
  };
}

const D14 = Array.from({ length: 14 }, (_, i) => `2026-07-${String(i + 8).padStart(2, "0")}`);
const D20 = Array.from({ length: 20 }, (_, i) => `2026-07-${String(i + 8).padStart(2, "0")}`);

describe("cellMarker", () => {
  it("mapt Zellzustände auf Marker", () => {
    expect(cellMarker(cell("shift", "Service"))).toBe("X");
    expect(cellMarker(cell("shift", "Bar"))).toBe("B");
    expect(cellMarker(cell("shift", "19 Uhr"))).toBe("19h");
    expect(cellMarker(cell("shift", "GL"))).toBe("GL");
    expect(cellMarker(cell("shift", "Hausmeister"))).toBe("H");
    expect(cellMarker(cell("urlaub"))).toBe("U");
    expect(cellMarker(cell("krank"))).toBe("K");
    expect(cellMarker(cell("wish"))).toBe("♡");
    expect(cellMarker(cell("available"))).toBe(EMPTY_MARKER);
    expect(cellMarker(cell("empty"))).toBe(EMPTY_MARKER);
  });
});

describe("buildRosterGrid", () => {
  it("filtert auf gewünschtes Fenster (abend) und Bereich (service)", () => {
    const abendCells: DisplayCell[] = D14.map((_, i) =>
      i === 0 ? cell("shift", "Service") : cell("empty"),
    );
    const mittagCells: DisplayCell[] = D14.map((_, i) =>
      i === 0 ? cell("shift", "Bar") : cell("empty"),
    );
    const periodBlocks: DisplayPeriodBlocks[] = [
      {
        period: "mittag",
        blocks: [makeBlock("service", [{ staffId: "s1", staffName: "Anna", cells: mittagCells }])],
      },
      {
        period: "abend",
        blocks: [makeBlock("service", [{ staffId: "s1", staffName: "Anna", cells: abendCells }])],
      },
    ];
    const grid = buildRosterGrid(
      { days: D14, blocks: [], periodBlocks },
      { area: "service", period: "abend", days: 14 },
    );
    expect(grid.rows).toHaveLength(1);
    expect(grid.rows[0].markers[0]).toBe("X"); // abend, nicht "B" von mittag
  });

  it("schneidet auf die ersten 14 Tage", () => {
    const cells: DisplayCell[] = D20.map(() => cell("shift", "Service"));
    const periodBlocks: DisplayPeriodBlocks[] = [
      {
        period: "abend",
        blocks: [makeBlock("service", [{ staffId: "s1", staffName: "Anna", cells }])],
      },
    ];
    const grid = buildRosterGrid(
      { days: D20, blocks: [], periodBlocks },
      { area: "service", period: "abend", days: 14 },
    );
    expect(grid.days).toHaveLength(14);
    expect(grid.rows[0].markers).toHaveLength(14);
  });

  it("zeigt Urlaub/Krank/Wunsch als U/K/♡ (tagesbasiert im Fenster-Block)", () => {
    const cells: DisplayCell[] = [
      cell("urlaub"),
      cell("krank"),
      cell("wish"),
      ...Array.from({ length: 11 }, () => cell("empty")),
    ];
    const periodBlocks: DisplayPeriodBlocks[] = [
      {
        period: "abend",
        blocks: [makeBlock("service", [{ staffId: "s1", staffName: "Anna", cells }])],
      },
    ];
    const grid = buildRosterGrid(
      { days: D14, blocks: [], periodBlocks },
      { area: "service", period: "abend", days: 14 },
    );
    expect(grid.rows[0].markers.slice(0, 3)).toEqual(["U", "K", "♡"]);
  });

  it("blendet Leerzeilen (nur EMPTY_MARKER) aus", () => {
    const leer: DisplayCell[] = D14.map(() => cell("empty"));
    const mit: DisplayCell[] = D14.map((_, i) =>
      i === 0 ? cell("shift", "Service") : cell("empty"),
    );
    const periodBlocks: DisplayPeriodBlocks[] = [
      {
        period: "abend",
        blocks: [
          makeBlock("service", [
            { staffId: "leer", staffName: "Leer", cells: leer },
            { staffId: "voll", staffName: "Voll", cells: mit },
          ]),
        ],
      },
    ];
    const grid = buildRosterGrid(
      { days: D14, blocks: [], periodBlocks },
      { area: "service", period: "abend", days: 14 },
    );
    expect(grid.rows).toHaveLength(1);
    expect(grid.rows[0].staffName).toBe("Voll");
  });

  it("nutzt blocks (Single-Period) wenn periodBlocks null ist", () => {
    const cells: DisplayCell[] = D14.map((_, i) => (i === 0 ? cell("shift", "GL") : cell("empty")));
    const grid = buildRosterGrid(
      {
        days: D14,
        blocks: [makeBlock("service", [{ staffId: "s1", staffName: "Anna", cells }])],
        periodBlocks: null,
      },
      { area: "service", period: "abend", days: 14 },
    );
    expect(grid.rows[0].markers[0]).toBe("GL");
  });
});
