// Excel-Export für die tägliche Bargeldübersicht.
// Spiegelt das Muster aus src/lib/time/weekly-export.ts (exceljs, bereits Dep).

import ExcelJS from "exceljs";
import { formatShortDate } from "@/lib/format-date";
import type { CashDailyRow } from "@/lib/cash/cash.functions";

export async function buildBargeldXlsx(rows: CashDailyRow[], monthLabel: string): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Coco";
  const ws = wb.addWorksheet(monthLabel);

  ws.addRow([
    "Datum",
    "Tagesumsatz",
    "Kreditkarten",
    "Take-Away",
    "OrderSmart",
    "Wolt",
    "Gutsch. EL",
    "FineDine",
    "Gutsch. VK",
    "Einladung",
    "Offene RE",
    "Vorschuss",
    "Ausgaben",
    "Bargeld",
  ]);
  ws.getRow(1).font = { bold: true };

  const money = (c: number) => c / 100;
  for (const r of rows) {
    ws.addRow([
      formatShortDate(r.businessDate),
      money(r.tagesumsatzCents),
      money(r.kreditkartenCents),
      money(r.deliveryVectronCents),
      money(r.deliverySouseCents),
      money(r.deliveryWoltCents),
      money(r.vouchersRedeemedCents),
      money(r.finedineCents),
      money(r.vouchersSoldCents),
      money(r.einladungCents),
      money(r.openInvoicesCents),
      money(r.vorschussCents),
      money(r.expensesCents),
      money(r.bargeldCents),
    ]);
  }

  const sum = (sel: (r: CashDailyRow) => number) => money(rows.reduce((s, r) => s + sel(r), 0));
  ws.addRow([
    "Summe",
    sum((r) => r.tagesumsatzCents),
    sum((r) => r.kreditkartenCents),
    sum((r) => r.deliveryVectronCents),
    sum((r) => r.deliverySouseCents),
    sum((r) => r.deliveryWoltCents),
    sum((r) => r.vouchersRedeemedCents),
    sum((r) => r.finedineCents),
    sum((r) => r.vouchersSoldCents),
    sum((r) => r.einladungCents),
    sum((r) => r.openInvoicesCents),
    sum((r) => r.vorschussCents),
    sum((r) => r.expensesCents),
    sum((r) => r.bargeldCents),
  ]);
  ws.lastRow!.font = { bold: true };

  for (let col = 2; col <= 14; col++) {
    ws.getColumn(col).numFmt = '#,##0.00 "€"';
    ws.getColumn(col).width = 13;
  }
  ws.getColumn(1).width = 14;

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
