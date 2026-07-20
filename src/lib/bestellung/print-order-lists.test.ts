import { describe, expect, it } from "vitest";
import { fmtLastOrderDdMm, renderOrderListsHtml } from "./print-order-lists";

describe("fmtLastOrderDdMm", () => {
  it("formatiert ISO als TT.MM.", () => {
    expect(fmtLastOrderDdMm("2026-07-17T09:00:00Z")).toMatch(/^\d{2}\.\d{2}\.$/);
  });
  it("liefert em-Dash bei null/leer", () => {
    expect(fmtLastOrderDdMm(null)).toBe("—");
    expect(fmtLastOrderDdMm("")).toBe("—");
  });
});

describe("renderOrderListsHtml", () => {
  it("rendert Lieferanten- und Wein-Abschnitt mit Sonstiges-Block", () => {
    const html = renderOrderListsHtml({
      locationName: "Spicery",
      sections: [
        {
          kind: "supplier",
          supplierName: "Top Service",
          articles: [
            {
              id: "a1",
              name: "Tomaten",
              category: "Gemüse",
              orderUnit: "kg",
              lastOrderIso: "2026-07-17T09:00:00Z",
            },
          ],
        },
        {
          kind: "wine",
          title: "Wein-Sammelliste",
          bySupplier: [
            {
              supplierName: "Fideser",
              articles: [
                { id: "w1", name: "Riesling", category: "Wein", orderUnit: "Fl", lastOrderIso: null },
              ],
            },
          ],
        },
      ],
    });
    expect(html).toContain("Top Service");
    expect(html).toContain("Wein-Sammelliste");
    expect(html).toContain("Riesling");
    expect(html).toContain("Sonstiges");
    expect(html).toContain("Fideser");
  });
});