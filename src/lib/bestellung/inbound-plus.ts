// BM1/K2 — Plus-Adress-Parser für Inbound-Mails.
//
// Erwartetes Format: antwort+ORD-YYYY-MM-NNNN@inbound.cocoplatform.online
// (Case-insensitiv im Plus-Teil; Bestellnummer wird immer UPPER-cased
// zurückgegeben, da unser Schema ORD-… groß speichert.)
//
// Rückgabe:
//   * matched Bestellnummer als String — oder null, wenn kein sauberes
//     Match (kein Plus-Teil, Fremdformat, mehrere Empfänger).
//
// Bewusst tolerant gegenüber MailerSend-Payload-Varianten: `to` kann String
// oder Array sein; wir prüfen alle Einträge und nehmen den ersten Treffer.

const PLUS_ORDER_RE = /^antwort\+(ord-\d{4}-\d{2}-\d{4})@/i;

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
