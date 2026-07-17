// BM1/K2 — Plus-Adress-Parser für Inbound-Mails.
//
// Erwartetes Format: antwort+<BESTELLNUMMER>@inbound.cocoplatform.online.
// Die Bestellnummer ist präfix-agnostisch: sowohl ORD-… (Warenkorb) als
// auch EO-… (EasyOrder) sind reale Präfixe. Wir nehmen den Plus-Teil
// verbatim (nur Format-Sanity: [A-Z]+, Bindestrich, alphanumerische
// Rest-Segmente ohne @/Whitespace) und liefern ihn UPPER-cased zurück —
// die Formatwahrheit ist die DB (orders.order_number), nicht dieser Regex.
//
// Rückgabe:
//   * matched Bestellnummer als String — oder null, wenn kein Plus-Teil
//     erkannt wurde.

const PLUS_RE = /^antwort\+([A-Z0-9][A-Z0-9-]*)@/i;

export type PlusAddrRecipient = string | { email?: string | null } | null | undefined;

export function extractOrderNumberFromRecipients(
  recipients: PlusAddrRecipient | PlusAddrRecipient[] | undefined,
): string | null {
  const list = Array.isArray(recipients) ? recipients : [recipients];
  for (const r of list) {
    const email = typeof r === "string" ? r : (r?.email ?? "");
    if (!email) continue;
    const m = PLUS_ORDER_RE.exec(email.trim());
    if (m) return m[1].toUpperCase();
  }
  return null;
}

export const INBOUND_DOMAIN = "inbound.cocoplatform.online";

export function buildReplyToForOrder(orderNumber: string): string {
  return `antwort+${orderNumber}@${INBOUND_DOMAIN}`;
}
