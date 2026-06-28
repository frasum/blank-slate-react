import { describe, it, expect } from "vitest";
import { parsePayslipName } from "./payslip-filename";

describe("parsePayslipName", () => {
  it("liest perso/jahr/monat aus edlohn-Dateinamen", () => {
    expect(parsePayslipName("Entgeltabrechnung-Robkla__Phattanaphol-000006-2026-05.pdf")).toEqual({
      persoNr: 6,
      year: 2026,
      month: 5,
    });
    expect(parsePayslipName("Entgeltabrechnung-Robkla__Phattanaphol-000006-2026-06.pdf")).toEqual({
      persoNr: 6,
      year: 2026,
      month: 6,
    });
    expect(parsePayslipName("Entgeltabrechnung-Schumann__Frank-000001-2026-06.pdf")).toEqual({
      persoNr: 1,
      year: 2026,
      month: 6,
    });
  });

  it("akzeptiert .PDF (Groß-Endung)", () => {
    expect(parsePayslipName("Entgeltabrechnung-X-000006-2026-06.PDF")).toEqual({
      persoNr: 6,
      year: 2026,
      month: 6,
    });
  });

  it("lehnt fremde Muster ab", () => {
    expect(parsePayslipName("report.pdf")).toBeNull();
    expect(parsePayslipName("Entgeltabrechnung-X-12-2026-06.pdf")).toBeNull();
    expect(parsePayslipName("Entgeltabrechnung-X-000006-2026-13.pdf")).toBeNull();
  });
});
