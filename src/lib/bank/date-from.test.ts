import { describe, expect, it } from "vitest";
import { computeDateFrom } from "./date-from";

describe("computeDateFrom", () => {
  it("Normalfall: max(buchungstag mit external_tx_id) − 7 Tage", () => {
    expect(
      computeDateFrom({
        today: "2026-07-11",
        maxBookingDateWithExternalTxId: "2026-07-08",
        maxBookingDateAny: "2026-07-08",
      }),
    ).toBe("2026-07-01");
  });

  it("Nur CSV-Historie: max(buchungstag) + 1 Tag — kein Hineingreifen in CSV-Bestand", () => {
    expect(
      computeDateFrom({
        today: "2026-07-11",
        maxBookingDateWithExternalTxId: null,
        maxBookingDateAny: "2026-06-30",
      }),
    ).toBe("2026-07-01");
  });

  it("Leeres Konto: today − 90 Tage", () => {
    expect(
      computeDateFrom({
        today: "2026-07-11",
        maxBookingDateWithExternalTxId: null,
        maxBookingDateAny: null,
      }),
    ).toBe("2026-04-12");
  });

  it("Monatsgrenze korrekt: 01. minus 7 Tage → Vormonat", () => {
    expect(
      computeDateFrom({
        today: "2026-07-11",
        maxBookingDateWithExternalTxId: "2026-03-05",
        maxBookingDateAny: "2026-03-05",
      }),
    ).toBe("2026-02-26");
  });
});