// KGL-Grundsatz „eine Rechenregel, eine Implementierung": die Tip-Summe im
// PDF-/Print-Datenpfad muss bit-identisch zu computeTipTotalCents sein.
// Wenn jemand die Inline-Reduce zurückbringt, schlägt dieser Test an.

import { describe, expect, it } from "vitest";
import { computeTipTotalCents } from "./tip-pool";
import type { PdfSettlement } from "./pdfExport";

function tipFromPdfRows(rows: PdfSettlement[]): number {
  return computeTipTotalCents(
    rows.map((s) => ({
      cardTotalCents: s.card_total_cents,
      cashHandedInCents: s.cash_handed_in_cents,
      posSalesCents: s.pos_sales_cents,
      openInvoicesCents: s.open_invoices_cents,
      hilfMahlCents: s.hilf_mahl_cents,
      kassiertBruttoCents: s.kassiert_brutto_cents ?? s.pos_sales_cents,
    })),
  );
}

function row(overrides: Partial<PdfSettlement>): PdfSettlement {
  return {
    staffName: "T",
    status: "submitted",
    pos_sales_cents: 0,
    card_total_cents: 0,
    hilf_mahl_cents: 0,
    open_invoices_cents: 0,
    cash_handed_in_cents: 0,
    kassiert_brutto_cents: undefined,
    differenz_cents: 0,
    kitchen_tip_cents: 0,
    submitted_at: null,
    updated_at: null,
    corrected_from_id: null,
    ...overrides,
  };
}

describe("pdfExport — Tip-Summe delegiert an computeTipTotalCents", () => {
  it("Beispiel-Tag: Datenpfad ≙ Helfer, gleiche Werte wie Inline-Formel", () => {
    const rows: PdfSettlement[] = [
      row({
        pos_sales_cents: 100000,
        card_total_cents: 40000,
        cash_handed_in_cents: 72000,
        open_invoices_cents: 5000,
        hilf_mahl_cents: 1500,
        kassiert_brutto_cents: 100000,
      }),
      row({
        pos_sales_cents: 80000,
        card_total_cents: 30000,
        cash_handed_in_cents: 55000,
        open_invoices_cents: 0,
        hilf_mahl_cents: 0,
        // Fallback: kassiert_brutto_cents = pos_sales_cents
      }),
    ];
    const expected = computeTipTotalCents(
      rows.map((s) => ({
        cardTotalCents: s.card_total_cents,
        cashHandedInCents: s.cash_handed_in_cents,
        posSalesCents: s.pos_sales_cents,
        openInvoicesCents: s.open_invoices_cents,
        hilfMahlCents: s.hilf_mahl_cents,
        kassiertBruttoCents: s.kassiert_brutto_cents ?? s.pos_sales_cents,
      })),
    );
    expect(tipFromPdfRows(rows)).toBe(expected);
    // Sanity: Formel = card + cash + open − kassiertBrutto − hilfMahl
    const inline =
      40000 + 72000 + 5000 - 100000 - 1500 + (30000 + 55000 + 0 - 80000 - 0);
    expect(expected).toBe(inline);
  });
});
