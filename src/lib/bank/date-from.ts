// BK2 — Naht-Formel für den GoCardless-Sync-Startpunkt.
//
// Ziel: der erste API-Sync darf NIE in einen CSV-Bestand hineingreifen,
// gegen den er nicht per external_tx_id deduplizieren kann. Deshalb:
// - Es gibt bereits Zeilen mit external_tx_id (früherer API-Sync):
//     date_from = max(buchungstag dieser Zeilen) − 7 Tage
// - Es gibt Zeilen, aber KEINE mit external_tx_id (nur CSV-Historie):
//     date_from = max(buchungstag aller Zeilen) + 1 Tag
// - Konto ist leer:
//     date_from = today − 90 Tage (GoCardless-Maximum)

export type ComputeDateFromInput = {
  today: string; // ISO YYYY-MM-DD
  maxBookingDateWithExternalTxId: string | null; // ISO oder null
  maxBookingDateAny: string | null; // ISO oder null
};

function shiftDaysIso(iso: string, deltaDays: number): string {
  // UTC-Datum-Arithmetik, um Zeitzonen-Rundungen zu vermeiden.
  const [y, m, d] = iso.split("-").map((n) => Number.parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function computeDateFrom(input: ComputeDateFromInput): string {
  if (input.maxBookingDateWithExternalTxId) {
    return shiftDaysIso(input.maxBookingDateWithExternalTxId, -7);
  }
  if (input.maxBookingDateAny) {
    return shiftDaysIso(input.maxBookingDateAny, 1);
  }
  return shiftDaysIso(input.today, -90);
}
