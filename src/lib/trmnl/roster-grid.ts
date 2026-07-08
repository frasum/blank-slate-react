// TRMNL2 — Reines Aufbereitungsmodul für die E-Ink-Dienstplan-Ansicht.
// Input: Display-Payload (aus buildDisplayData). Output: 14-Tage-Grid für
// ein Fenster + einen Bereich (Standardfall: service/abend). Zell-Marker
// nutzen die bestehende serviceMarker-Funktion; keine eigene Neu-Ableitung.

import { serviceMarker } from "@/lib/roster/service-marker";
import type {
  DisplayBlock,
  DisplayPeriodBlocks,
  DisplayCell,
} from "@/lib/display/display-data.server";

export type PayloadLike = {
  days: string[];
  blocks: DisplayBlock[];
  periodBlocks: DisplayPeriodBlocks[] | null;
};

export type Marker = string; // "X" | "B" | "19h" | "GL" | "H" | "U" | "K" | "♡" | "–"

export type GridRow = {
  staffId: string;
  staffName: string;
  markers: Marker[];
};

export type Grid = {
  days: string[];
  rows: GridRow[];
};

export const EMPTY_MARKER = "–";

export function cellMarker(cell: DisplayCell): Marker {
  switch (cell.k) {
    case "shift":
      return serviceMarker(cell.skill);
    case "urlaub":
      return "U";
    case "krank":
      return "K";
    case "wish":
      return "♡";
    case "available":
    case "empty":
    default:
      return EMPTY_MARKER;
  }
}

export function buildRosterGrid(
  payload: PayloadLike,
  opts: { area: "service" | "kitchen"; period: "frueh" | "mittag" | "abend"; days: number },
): Grid {
  const wantedDays = payload.days.slice(0, opts.days);

  // Bereichs-Block finden: entweder periodBlocks (Multi-Fenster) oder blocks.
  let block: DisplayBlock | undefined;
  if (payload.periodBlocks && payload.periodBlocks.length > 0) {
    const entry = payload.periodBlocks.find((p) => p.period === opts.period);
    block = entry?.blocks.find((b) => b.area === opts.area);
  } else {
    block = payload.blocks.find((b) => b.area === opts.area);
  }

  if (!block) return { days: wantedDays, rows: [] };

  const rows: GridRow[] = [];
  for (const r of block.rows) {
    const markers = r.cells.slice(0, opts.days).map(cellMarker);
    // Leerzeilen (ausschließlich EMPTY_MARKER) ausblenden.
    if (markers.every((m) => m === EMPTY_MARKER)) continue;
    rows.push({ staffId: r.staffId, staffName: r.staffName, markers });
  }

  return { days: wantedDays, rows };
}
