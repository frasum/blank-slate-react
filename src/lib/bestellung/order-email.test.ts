import { describe, it, expect } from "vitest";
import {
  buildOrderEmailSubject,
  buildOrderEmailHtml,
  buildOrderEmailText,
  type OrderEmailData,
} from "./order-email";

const sample: OrderEmailData = {
  orderNumber: "ORD-2026-06-0001",
  supplierName: "Lieferant GmbH",
  customerNumber: "K-4711",
  restaurantName: "COCO Mitte",
  deliveryAddress: "COCO Mitte\nMusterstr. 1\n10115 Berlin",
  deliveryDate: "2026-06-20",
  timeWindow: "08:00–10:00",
  notes: null,
  items: [
    {
      articleName: "Tomaten rot",
      sku: "TOM-01",
      quantity: 5,
      unit: "kg",
      unitPriceCents: 250,
      totalPriceCents: 1250,
      isFreeText: false,
    },
    {
      articleName: "Sonderwunsch Kräuter",
      sku: null,
      quantity: 2,
      unit: "Bund",
      unitPriceCents: 0,
      totalPriceCents: 0,
      isFreeText: true,
    },
  ],
  totalAmountCents: 1250,
};

describe("order-email", () => {
  it("subject enthält Bestellnummer, Restaurant und Kunden-Nr.", () => {
    const s = buildOrderEmailSubject(sample);
    expect(s).toContain("ORD-2026-06-0001");
    expect(s).toContain("COCO Mitte");
    expect(s).toContain("K-4711");
  });

  it("subject ohne Kunden-Nr. wenn nicht gesetzt", () => {
    const s = buildOrderEmailSubject({ ...sample, customerNumber: null });
    expect(s).not.toContain("Kd-Nr.");
  });

  it("html enthält jeden Artikelnamen und die de-DE Summe", () => {
    const html = buildOrderEmailHtml(sample);
    expect(html).toContain("Tomaten rot");
    expect(html).toContain("Sonderwunsch Kräuter");
    expect(html).toContain("12,50 €");
  });

  it("html zeigt für Freitext-Items keinen Einzelpreis (—)", () => {
    const html = buildOrderEmailHtml(sample);
    // Freitext-Zeile darf 0,00 € nicht enthalten — wir zeigen "—".
    const freeRow = html.split("Sonderwunsch Kräuter")[1] ?? "";
    const upToNextRow = freeRow.split("</tr>")[0] ?? "";
    expect(upToNextRow).not.toContain("0,00 €");
    expect(upToNextRow).toContain("—");
  });

  it("text-Fallback: Freitext ohne Preis, Standard mit à/= Format", () => {
    const t = buildOrderEmailText(sample);
    expect(t).toContain("- Tomaten rot [TOM-01]: 5 kg à 2,50 € = 12,50 €");
    expect(t).toContain("- Sonderwunsch Kräuter: 2 Bund");
    expect(t).toContain("Gesamt: 12,50 €");
  });
});
