// Tagesabrechnung-PDF, Client-seitig generiert (jsPDF + autoTable).
// Bewusst kompakt: Header, Kennzahlen, Kanäle/Terminals, Kellner-Abrechnungen,
// Vorschüsse, Ausgaben, Notiz. Werte aus dem cents-basierten Overview-DTO.

import { format } from "date-fns";
import { de } from "date-fns/locale";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type Cents = number;

export interface PdfChannel {
  id: string;
  label: string;
}
export interface PdfTerminal {
  id: string;
  label: string;
}

export interface PdfSession {
  business_date: string;
  guest_count?: number | null;
  vouchers_sold_cents?: number | null;
  vouchers_redeemed_cents?: number | null;
  finedine_vouchers_cents?: number | null;
  vorschuss_cents?: number | null;
  einladung_cents?: number | null;
  sonstige_einnahme_cents?: number | null;
  cash_actual_cents?: number | null;
  notes?: string | null;
}

export interface PdfSettlement {
  staffName: string;
  status: string;
  pos_sales_cents: Cents;
  card_total_cents: Cents;
  hilf_mahl_cents: Cents;
  open_invoices_cents: Cents;
  cash_handed_in_cents: Cents;
  differenz_cents: Cents;
  kitchen_tip_cents: Cents;
}

export interface PdfExportData {
  session: PdfSession;
  locationName?: string;
  createdByName?: string | null;
  channels: PdfChannel[];
  channelAmounts: { channelId: string; amountCents: Cents }[];
  terminals: PdfTerminal[];
  terminalAmounts: { terminalId: string; amountCents: Cents }[];
  settlements: PdfSettlement[];
  expenses: { description: string | null; amountCents: Cents }[];
  advances: { staffName: string; amountCents: Cents; note: string | null }[];
}

function fmt(cents: Cents | null | undefined): string {
  const v = (cents ?? 0) / 100;
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(v);
}

export function generateDailySummaryPdf(data: PdfExportData): {
  blobUrl: string;
  blob: Blob;
  fileName: string;
} {
  const doc = new jsPDF("portrait");
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 12;
  let y = 14;

  // ---- Header
  const dateStr = format(new Date(data.session.business_date + "T00:00:00"), "EEEE, d. MMMM yyyy", {
    locale: de,
  });
  const headerLeft = data.locationName ? `${data.locationName} · ${dateStr}` : dateStr;
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Tagesabrechnung", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(headerLeft, margin, y + 6);
  y += 12;

  doc.setFontSize(7);
  doc.setTextColor(120);
  const sub: string[] = [];
  if (data.createdByName) sub.push(`Erstellt von ${data.createdByName}`);
  sub.push(`Export ${format(new Date(), "dd.MM.yyyy HH:mm", { locale: de })}`);
  doc.text(sub.join(" · "), margin, y);
  doc.setTextColor(0);
  y += 4;

  // ---- Gäste & Gutscheine
  const sess = data.session;
  const gastInfo: [string, string][] = [];
  gastInfo.push(["Gäste", String(sess.guest_count ?? 0)]);
  gastInfo.push(["Gutscheine verkauft", fmt(sess.vouchers_sold_cents)]);
  gastInfo.push(["Gutscheine eingelöst", fmt(sess.vouchers_redeemed_cents)]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Gäste & Gutscheine", ""]],
    body: gastInfo,
    theme: "striped",
    headStyles: { fillColor: [241, 245, 249], textColor: 30, fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 1.5 },
    columnStyles: { 1: { halign: "right" } },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

  // ---- Kanäle
  if (data.channels.length > 0) {
    const chMap = new Map(data.channelAmounts.map((a) => [a.channelId, a.amountCents]));
    const rows = data.channels.map((c) => [c.label, fmt(chMap.get(c.id) ?? 0)]);
    const sum = data.channelAmounts.reduce((acc, a) => acc + a.amountCents, 0);
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Umsätze (Kanäle)", ""]],
      body: rows,
      foot: [["Summe", fmt(sum)]],
      theme: "striped",
      headStyles: { fillColor: [241, 245, 249], textColor: 30, fontStyle: "bold" },
      footStyles: { fillColor: [241, 245, 249], textColor: 30, fontStyle: "bold" },
      styles: { fontSize: 9, cellPadding: 1.5 },
      columnStyles: { 1: { halign: "right" } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  }

  // ---- Terminals
  if (data.terminals.length > 0) {
    const tmMap = new Map(data.terminalAmounts.map((a) => [a.terminalId, a.amountCents]));
    const rows = data.terminals.map((t) => [t.label, fmt(tmMap.get(t.id) ?? 0)]);
    const sum = data.terminalAmounts.reduce((acc, a) => acc + a.amountCents, 0);
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Karten-Terminals", ""]],
      body: rows,
      foot: [["Summe", fmt(sum)]],
      theme: "striped",
      headStyles: { fillColor: [241, 245, 249], textColor: 30, fontStyle: "bold" },
      footStyles: { fillColor: [241, 245, 249], textColor: 30, fontStyle: "bold" },
      styles: { fontSize: 9, cellPadding: 1.5 },
      columnStyles: { 1: { halign: "right" } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  }

  // ---- Kellner-Abrechnungen
  const active = data.settlements.filter((s) => s.status !== "superseded");
  if (active.length > 0) {
    const rows = active.map((s) => [
      s.staffName,
      fmt(s.pos_sales_cents),
      fmt(s.card_total_cents),
      fmt(s.hilf_mahl_cents),
      fmt(s.open_invoices_cents),
      fmt(s.cash_handed_in_cents),
      fmt(s.differenz_cents),
      fmt(s.kitchen_tip_cents),
    ]);
    const sumIdx = [1, 2, 3, 4, 5, 6, 7];
    const totals = sumIdx.map((i) =>
      active.reduce((acc, s) => {
        const keys: (keyof PdfSettlement)[] = [
          "pos_sales_cents",
          "card_total_cents",
          "hilf_mahl_cents",
          "open_invoices_cents",
          "cash_handed_in_cents",
          "differenz_cents",
          "kitchen_tip_cents",
        ];
        return acc + (s[keys[i - 1]] as number);
      }, 0),
    );
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Kellner", "POS", "Karte", "HilfMahl", "Offen", "Bargeld", "Diff", "KüTrkg"]],
      body: rows,
      foot: [["Summe", ...totals.map((t) => fmt(t))]],
      theme: "striped",
      headStyles: { fillColor: [241, 245, 249], textColor: 30, fontStyle: "bold" },
      footStyles: { fillColor: [241, 245, 249], textColor: 30, fontStyle: "bold" },
      styles: { fontSize: 8, cellPadding: 1.2 },
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right" },
        5: { halign: "right" },
        6: { halign: "right" },
        7: { halign: "right" },
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  }

  // ---- Vorschüsse
  if (data.advances.length > 0) {
    const rows = data.advances.map((a) => [a.staffName, a.note ?? "", fmt(a.amountCents)]);
    const sum = data.advances.reduce((acc, a) => acc + a.amountCents, 0);
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Vorschüsse", "Notiz", ""]],
      body: rows,
      foot: [["Summe", "", fmt(sum)]],
      theme: "striped",
      headStyles: { fillColor: [241, 245, 249], textColor: 30, fontStyle: "bold" },
      footStyles: { fillColor: [241, 245, 249], textColor: 30, fontStyle: "bold" },
      styles: { fontSize: 9, cellPadding: 1.5 },
      columnStyles: { 2: { halign: "right" } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  }

  // ---- Ausgaben
  if (data.expenses.length > 0) {
    const rows = data.expenses.map((e) => [e.description ?? "", fmt(e.amountCents)]);
    const sum = data.expenses.reduce((acc, e) => acc + e.amountCents, 0);
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Ausgaben", ""]],
      body: rows,
      foot: [["Summe", fmt(sum)]],
      theme: "striped",
      headStyles: { fillColor: [241, 245, 249], textColor: 30, fontStyle: "bold" },
      footStyles: { fillColor: [241, 245, 249], textColor: 30, fontStyle: "bold" },
      styles: { fontSize: 9, cellPadding: 1.5 },
      columnStyles: { 1: { halign: "right" } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  }

  // ---- Sonstiges (Kassen-Ist, Notiz)
  const sonstiges: [string, string][] = [];
  if (sess.cash_actual_cents !== null && sess.cash_actual_cents !== undefined) {
    sonstiges.push(["Kasse Ist", fmt(sess.cash_actual_cents)]);
  }
  if ((sess.finedine_vouchers_cents ?? 0) !== 0)
    sonstiges.push(["Finedine-Gutscheine", fmt(sess.finedine_vouchers_cents)]);
  if ((sess.vorschuss_cents ?? 0) !== 0)
    sonstiges.push(["Vorschuss (Abzug)", fmt(sess.vorschuss_cents)]);
  if ((sess.einladung_cents ?? 0) !== 0)
    sonstiges.push(["Einladung (Abzug)", fmt(sess.einladung_cents)]);
  if ((sess.sonstige_einnahme_cents ?? 0) !== 0)
    sonstiges.push(["Sonstige Einnahme", fmt(sess.sonstige_einnahme_cents)]);

  if (sonstiges.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Sonstiges", ""]],
      body: sonstiges,
      theme: "striped",
      headStyles: { fillColor: [241, 245, 249], textColor: 30, fontStyle: "bold" },
      styles: { fontSize: 9, cellPadding: 1.5 },
      columnStyles: { 1: { halign: "right" } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  }

  // ---- Notiz
  if (sess.notes && sess.notes.trim().length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Notiz"]],
      body: [[sess.notes]],
      theme: "striped",
      headStyles: { fillColor: [241, 245, 249], textColor: 30, fontStyle: "bold" },
      styles: { fontSize: 9, cellPadding: 2 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  }

  // ---- Footer (Seitenzahl)
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(
      `Seite ${i} / ${pageCount}`,
      pageWidth - margin,
      doc.internal.pageSize.getHeight() - 6,
      { align: "right" },
    );
  }

  const fileName = `Tagesabrechnung_${sess.business_date}.pdf`;
  const blob = doc.output("blob");
  const blobUrl = URL.createObjectURL(blob);
  return { blobUrl, blob, fileName };
}
