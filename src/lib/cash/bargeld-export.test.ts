import { describe, it, expect } from "vitest";
import { buildBargeldXlsx } from "./bargeld-export";
import type { CashDailyRow } from "./cash.functions";

const row: CashDailyRow = {
  businessDate: "2026-06-02",
  tagesumsatzCents: 595250,
  kreditkartenCents: 560647,
  deliverySouseCents: 0,
  deliveryWoltCents: 28360,
  finedineCents: 0,
  vouchersRedeemedCents: 10000,
  vouchersSoldCents: 0,
  einladungCents: 0,
  openInvoicesCents: 0,
  vorschussCents: 0,
  expensesCents: 3971,
  sonstigeEinnahmeCents: 0,
  bargeldCents: 16040,
};

describe("buildBargeldXlsx", () => {
  it("erzeugt einen nicht-leeren Blob", async () => {
    const blob = await buildBargeldXlsx([row, { ...row, businessDate: "2026-06-03" }], "Juni 2026");
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toContain("spreadsheetml");
  });
});