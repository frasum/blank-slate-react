// BK2 — Mapper GoCardless BAD → BankTxRaw (rein, ohne IO).
//
// Nur `booked`-Transaktionen werden verarbeitet (`pending` haben instabile
// IDs → würden Dubletten erzeugen, sobald sie fest werden).
//
// Zeilen ohne `transactionId` UND ohne `internalTransactionId` werden
// übersprungen (skipped++) — sie dürfen nie mit external_tx_id=NULL
// importiert werden: der partielle Unique-Index greift für NULL nicht,
// Dubletten kämen zurück.

export type GcTransaction = {
  transactionId?: string | null;
  internalTransactionId?: string | null;
  bookingDate?: string | null;
  valueDate?: string | null;
  transactionAmount?: { amount?: string | number | null; currency?: string | null } | null;
  creditorName?: string | null;
  debtorName?: string | null;
  remittanceInformationUnstructured?: string | null;
  remittanceInformationUnstructuredArray?: string[] | null;
};

export type GcTransactionsResponse = {
  transactions?: {
    booked?: GcTransaction[] | null;
    pending?: GcTransaction[] | null;
  } | null;
};

export type MappedRow = {
  externalTxId: string;
  buchungstag: string; // ISO YYYY-MM-DD
  wertstellungstag: string | null;
  betragCents: number;
  gegenpartei: string;
  verwendungszweck: string;
};

export type MapResult = {
  rows: MappedRow[];
  skippedNoId: number;
  skippedNoEur: number;
  skippedNoDate: number;
  skippedPending: number;
};

function isoDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(input);
  return m ? m[1] : null;
}

function amountToCents(amount: string | number | null | undefined): number | null {
  if (amount == null) return null;
  const n = typeof amount === "number" ? amount : Number.parseFloat(amount);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function pickGegenpartei(tx: GcTransaction): string {
  const c = tx.creditorName?.trim();
  if (c) return c;
  const d = tx.debtorName?.trim();
  if (d) return d;
  const arr = tx.remittanceInformationUnstructuredArray;
  if (arr && arr.length > 0) {
    const first = arr[0]?.trim();
    if (first) return first;
  }
  return "";
}

function pickZweck(tx: GcTransaction): string {
  const s = tx.remittanceInformationUnstructured?.trim();
  if (s) return s;
  const arr = tx.remittanceInformationUnstructuredArray;
  if (arr && arr.length > 0)
    return arr
      .map((x) => x?.trim() ?? "")
      .filter(Boolean)
      .join(" · ");
  return "";
}

export function mapGcTransactionsResponse(resp: GcTransactionsResponse): MapResult {
  const out: MappedRow[] = [];
  let skippedNoId = 0;
  let skippedNoEur = 0;
  let skippedNoDate = 0;
  const pending = resp.transactions?.pending?.length ?? 0;
  const booked = resp.transactions?.booked ?? [];
  for (const tx of booked) {
    const externalTxId = (tx.transactionId ?? tx.internalTransactionId ?? "").trim();
    if (!externalTxId) {
      skippedNoId++;
      continue;
    }
    const currency = tx.transactionAmount?.currency?.trim().toUpperCase();
    if (currency !== "EUR") {
      skippedNoEur++;
      continue;
    }
    const cents = amountToCents(tx.transactionAmount?.amount ?? null);
    if (cents == null) {
      skippedNoEur++;
      continue;
    }
    const buchungstag = isoDate(tx.bookingDate);
    if (!buchungstag) {
      skippedNoDate++;
      continue;
    }
    out.push({
      externalTxId,
      buchungstag,
      wertstellungstag: isoDate(tx.valueDate),
      betragCents: cents,
      gegenpartei: pickGegenpartei(tx),
      verwendungszweck: pickZweck(tx),
    });
  }
  return {
    rows: out,
    skippedNoId,
    skippedNoEur,
    skippedNoDate,
    skippedPending: pending,
  };
}
