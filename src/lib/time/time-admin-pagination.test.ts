// N1 (Nachprüfung 13.07.): Belegt, dass die drei Batch-Loader für Zeit-
// Übersicht/SFN/Wochenplan die 1000-Zeilen-Kappung von PostgREST NICHT
// erben. Ohne selectAllPaged würden Monats- oder Wochen-Aggregate stumm
// abschneiden. Ein Test je Loader, damit eine Regression sofort im CI
// zeigt, WELCHE Ansicht wieder trunkiert.
import { describe, it, expect } from "vitest";
import {
  _loadTimeEntriesForOverviewBatch,
  _loadTimeEntriesForSfnBatch,
  _loadTimeEntriesForWeeklyBatch,
} from "./time-admin.functions";

function makeFakeAdmin(totalRows: number) {
  // Simuliert die PostgREST-Builder-Kette. .range(from,to) liefert die
  // passende Seite; selectAllPaged bricht ab, sobald eine Seite < pageSize
  // zurückkommt.
  const rows = Array.from({ length: totalRows }, (_, i) => ({
    id: `id-${i.toString().padStart(6, "0")}`,
    location_id: "loc-1",
    staff_id: `staff-${i % 10}`,
    business_date: "2026-07-13",
    started_at: "2026-07-13T10:00:00Z",
    ended_at: "2026-07-13T18:00:00Z",
    source: "manual",
    staff: { display_name: "X" },
    break_minutes: 0,
    department: "service" as const,
  }));
  return {
    from: () => {
      const chain: Record<string, unknown> = {};
      const passthrough = () => chain;
      chain.select = passthrough;
      chain.eq = passthrough;
      chain.in = passthrough;
      chain.gte = passthrough;
      chain.lte = passthrough;
      chain.not = passthrough;
      chain.order = passthrough;
      chain.range = async (from: number, to: number) => ({
        data: rows.slice(from, to + 1),
        error: null,
      });
      return chain;
    },
  } as never;
}

describe("Batch-Loader — Paginierung über 1000 Zeilen (N1)", () => {
  it("_loadTimeEntriesForOverviewBatch liefert alle 2345 Zeilen", async () => {
    const admin = makeFakeAdmin(2345);
    const out = await _loadTimeEntriesForOverviewBatch(
      admin,
      "org-1",
      ["loc-1"],
      "2026-07-01",
      "2026-07-31",
    );
    expect(out).toHaveLength(2345);
  });

  it("_loadTimeEntriesForSfnBatch liefert alle 1500 Zeilen", async () => {
    const admin = makeFakeAdmin(1500);
    const out = await _loadTimeEntriesForSfnBatch(
      admin,
      "org-1",
      ["loc-1"],
      "2026-07-01",
      "2026-07-31",
    );
    expect(out).toHaveLength(1500);
  });

  it("_loadTimeEntriesForWeeklyBatch liefert alle 1001 Zeilen (Grenzfall)", async () => {
    const admin = makeFakeAdmin(1001);
    const out = await _loadTimeEntriesForWeeklyBatch(
      admin,
      "org-1",
      ["loc-1"],
      "2026-07-06",
      "2026-07-12",
    );
    expect(out).toHaveLength(1001);
  });
});
