// Reine Builder-Funktionen für die Bestell-E-Mail an Lieferanten (Welle 1-D).
// Keine Seiteneffekte, kein DB-Zugriff — leicht testbar. Inline-Styles, damit
// Mail-Clients (Gmail, Outlook) kein externes CSS brauchen.

export type OrderEmailItem = {
  articleName: string;
  sku: string | null;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  totalPriceCents: number;
  isFreeText: boolean;
};

export type OrderEmailData = {
  orderNumber: string;
  supplierName: string;
  customerNumber: string | null;
  restaurantName: string;
  deliveryAddress: string;
  deliveryDate: string | null;
  timeWindow: string | null;
  notes: string | null;
  items: OrderEmailItem[];
  totalAmountCents: number;
};

/**
 * Testmodus-Kontext: wenn gesetzt, wird die Mail mit einem [TEST]-Präfix
 * und einem Hinweisbanner versendet, der die eigentlich vorgesehene
 * Lieferanten-Adresse nennt. Der Versand-Helper überschreibt zusätzlich
 * den `to`-Empfänger.
 */
export type TestModeContext = {
  originalSupplierEmail: string;
};

function fmtEur(cents: number): string {
  return (
    (cents / 100).toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " €"
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function nl2br(s: string): string {
  return escapeHtml(s).replace(/\n/g, "<br />");
}

export function buildOrderEmailSubject(d: OrderEmailData, test?: TestModeContext): string {
  const suffix = d.customerNumber ? ` (Kd-Nr. ${d.customerNumber})` : "";
  const prefix = test ? "[TEST] " : "";
  return `${prefix}Neue Bestellung ${d.orderNumber} von ${d.restaurantName}${suffix}`;
}

export function buildOrderEmailHtml(d: OrderEmailData, test?: TestModeContext): string {
  const rows = d.items
    .map((it) => {
      const name = escapeHtml(it.articleName);
      const sku = it.sku
        ? `<div style="font-size:11px;color:#666">${escapeHtml(it.sku)}</div>`
        : "";
      const qty = `${it.quantity} ${escapeHtml(it.unit)}`;
      const unitP = it.isFreeText ? "—" : fmtEur(it.unitPriceCents);
      const lineT = it.isFreeText ? "—" : fmtEur(it.totalPriceCents);
      return `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #eee">${name}${sku}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${qty}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${unitP}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${lineT}</td>
        </tr>`;
    })
    .join("");

  const metaRow = (label: string, value: string) =>
    `<tr><td style="padding:4px 8px;color:#666;font-size:12px;width:160px">${label}</td><td style="padding:4px 8px;font-size:12px">${value}</td></tr>`;

  const meta =
    metaRow("Besteller", escapeHtml(d.restaurantName || "—")) +
    metaRow("Lieferant", escapeHtml(d.supplierName)) +
    (d.customerNumber ? metaRow("Kunden-Nr.", escapeHtml(d.customerNumber)) : "") +
    metaRow("Lieferdatum", escapeHtml(d.deliveryDate ?? "—")) +
    metaRow("Zeitfenster", escapeHtml(d.timeWindow ?? "—")) +
    metaRow("Lieferadresse", nl2br(d.deliveryAddress || "—"));

  const notesBlock = d.notes
    ? `<div style="margin:16px 0;padding:12px;background:#fff8e1;border-left:3px solid #f59e0b;font-size:13px"><strong>Notiz:</strong><br />${nl2br(d.notes)}</div>`
    : "";

  const testBanner = test
    ? `<div style="margin:0 0 16px 0;padding:12px;background:#fee2e2;border-left:3px solid #dc2626;font-size:13px;color:#7f1d1d"><strong>Testbestellung</strong> — diese Mail würde regulär an <strong>${escapeHtml(test.originalSupplierEmail)}</strong> gehen. Der Lieferant erhält nichts.</div>`
    : "";

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#222">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f5;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="background:#fff;border-radius:8px;overflow:hidden;max-width:640px;width:100%">
        <tr><td style="padding:20px 24px;background:#111;color:#fff">
          <div style="font-size:12px;opacity:0.7;text-transform:uppercase;letter-spacing:1px">Neue Bestellung</div>
          <div style="font-size:20px;font-weight:600;margin-top:4px">${escapeHtml(d.supplierName)}</div>
          <div style="font-size:13px;opacity:0.8;margin-top:2px">Bestell-Nr. ${escapeHtml(d.orderNumber)}</div>
        </td></tr>
        <tr><td style="padding:16px 24px">
          ${testBanner}
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${meta}</table>
          ${notesBlock}
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:12px;border-top:2px solid #111">
            <thead><tr>
              <th style="padding:8px;text-align:left;font-size:12px;color:#666">Artikel</th>
              <th style="padding:8px;text-align:right;font-size:12px;color:#666">Menge</th>
              <th style="padding:8px;text-align:right;font-size:12px;color:#666">Einzel</th>
              <th style="padding:8px;text-align:right;font-size:12px;color:#666">Summe</th>
            </tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr>
              <td colspan="3" style="padding:12px 8px;text-align:right;font-weight:600">Gesamt</td>
              <td style="padding:12px 8px;text-align:right;font-weight:600;white-space:nowrap">${fmtEur(d.totalAmountCents)}</td>
            </tr></tfoot>
          </table>
        </td></tr>
        <tr><td style="padding:16px 24px;background:#fafafa;font-size:11px;color:#888;border-top:1px solid #eee">
          Diese Bestellung wurde automatisch von COCO erzeugt. Bitte bestätigen Sie den Eingang per Antwort.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function buildOrderEmailText(d: OrderEmailData, test?: TestModeContext): string {
  const lines: string[] = [];
  if (test) {
    lines.push(
      `[TEST] Testbestellung — würde regulär an ${test.originalSupplierEmail} gehen. Der Lieferant erhält nichts.`,
    );
    lines.push("");
  }
  lines.push(`Neue Bestellung ${d.orderNumber}`);
  lines.push(`Besteller: ${d.restaurantName || "—"}`);
  lines.push(`Lieferant: ${d.supplierName}`);
  if (d.customerNumber) lines.push(`Kunden-Nr.: ${d.customerNumber}`);
  lines.push(`Lieferdatum: ${d.deliveryDate ?? "—"}`);
  lines.push(`Zeitfenster: ${d.timeWindow ?? "—"}`);
  lines.push(`Lieferadresse:\n${d.deliveryAddress || "—"}`);
  if (d.notes) lines.push(`\nNotiz: ${d.notes}`);
  lines.push("");
  lines.push("Artikel:");
  for (const it of d.items) {
    const sku = it.sku ? ` [${it.sku}]` : "";
    if (it.isFreeText) {
      lines.push(`- ${it.articleName}${sku}: ${it.quantity} ${it.unit}`);
    } else {
      lines.push(
        `- ${it.articleName}${sku}: ${it.quantity} ${it.unit} à ${fmtEur(it.unitPriceCents)} = ${fmtEur(it.totalPriceCents)}`,
      );
    }
  }
  lines.push("");
  lines.push(`Gesamt: ${fmtEur(d.totalAmountCents)}`);
  return lines.join("\n");
}
