import { describe, expect, it } from "vitest";
import {
  ReplacePosSalesStatsInput,
  checkRowsAgainstFooter,
  type PosRow,
} from "./pos-report-server";

const validRow: PosRow = { nummer: 1, name: "Espresso", verkaufCount: 5, umsatzCents: 1250 };

describe("ReplacePosSalesStatsInput", () => {
  const base = {
    // zod 4 validiert Versions-/Varianten-Bits — Dummy muss RFC-4122-konform sein.
    locationId: "11111111-1111-4111-8111-111111111111",
    period: "d365" as const,
    reportDate: "2026-01-01",
    rows: [validRow],
    footer: { verkaufCount: 5, umsatzCents: 1250 },
  };

  it("akzeptiert einen gültigen Import", () => {
    expect(ReplacePosSalesStatsInput.safeParse(base).success).toBe(true);
  });

  it("lehnt unbekannte Periode ab", () => {
    const r = ReplacePosSalesStatsInput.safeParse({ ...base, period: "monat" });
    expect(r.success).toBe(false);
  });

  it("lehnt Datum in der Zukunft ab", () => {
    const r = ReplacePosSalesStatsInput.safeParse({ ...base, reportDate: "2999-12-31" });
    expect(r.success).toBe(false);
  });

  it("lehnt leere Zeilen-Liste ab", () => {
    const r = ReplacePosSalesStatsInput.safeParse({ ...base, rows: [] });
    expect(r.success).toBe(false);
  });

  it("lehnt leere Artikelnamen ab", () => {
    const r = ReplacePosSalesStatsInput.safeParse({
      ...base,
      rows: [{ ...validRow, name: "  " }],
    });
    expect(r.success).toBe(false);
  });
});

describe("checkRowsAgainstFooter", () => {
  it("erkennt exakten Treffer", () => {
    const r = checkRowsAgainstFooter([validRow], { verkaufCount: 5, umsatzCents: 1250 });
    expect(r.matches).toBe(true);
  });

  it("meldet Mismatch bei abweichendem Cent-Betrag", () => {
    const r = checkRowsAgainstFooter([validRow], { verkaufCount: 5, umsatzCents: 1251 });
    expect(r.matches).toBe(false);
    expect(r.sumCents).toBe(1250);
  });
});
