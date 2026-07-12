// BK2 — Cross-Account-Duplikatswarnung im CSV-Import (rein, ohne IO).
//
// Ziel: den 16:40-Fehl-Import (YUM-CSV → Spicery-Konto) hätte diese Prüfung
// gestoppt. Fingerprint bewusst OHNE Verwendungszweck (die Zweck-Texte
// variieren zwischen Konten für dieselbe reale Buchung), aber MIT
// Buchungstag + Betrag + normalisierter Gegenpartei — das reicht, um 1099
// Fremdzeilen einer YUM-CSV in einem anderen Konto der Org zu erkennen.

export type FingerprintInput = {
  buchungstag: string; // ISO YYYY-MM-DD
  betragCents: number;
  gegenpartei: string;
};

export function normalizeGegenpartei(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function fingerprint(row: FingerprintInput): string {
  return `${row.buchungstag}|${row.betragCents}|${normalizeGegenpartei(row.gegenpartei)}`;
}

export type CandidateRow = FingerprintInput & { key?: string };
export type ExistingRow = FingerprintInput & {
  accountId: string;
  accountName: string;
  iban: string;
};

export type CrossAccountHit = {
  candidate: CandidateRow;
  existing: ExistingRow;
};

/**
 * Vergleicht Kandidatenzeilen (frisch geparste CSV) gegen Zeilen aus ANDEREN
 * Konten der gleichen Org. Duplikat = gleicher Fingerprint.
 * Rückgabe listet je Kandidat den ersten Treffer aus einem Fremdkonto.
 */
export function findCrossAccountMatches(
  candidates: readonly CandidateRow[],
  existingInOtherAccounts: readonly ExistingRow[],
): CrossAccountHit[] {
  const byFp = new Map<string, ExistingRow>();
  for (const e of existingInOtherAccounts) {
    const fp = fingerprint(e);
    if (!byFp.has(fp)) byFp.set(fp, e);
  }
  const hits: CrossAccountHit[] = [];
  for (const c of candidates) {
    const fp = fingerprint(c);
    const e = byFp.get(fp);
    if (e) hits.push({ candidate: c, existing: e });
  }
  return hits;
}

/** Aggregat pro Fremd-Konto: Anzahl Treffer + Konto-Metadaten. */
export type CrossAccountSummary = {
  accountId: string;
  accountName: string;
  iban: string;
  count: number;
};

export function summarizeCrossAccountHits(hits: readonly CrossAccountHit[]): CrossAccountSummary[] {
  const map = new Map<string, CrossAccountSummary>();
  for (const h of hits) {
    const cur = map.get(h.existing.accountId);
    if (cur) {
      cur.count += 1;
    } else {
      map.set(h.existing.accountId, {
        accountId: h.existing.accountId,
        accountName: h.existing.accountName,
        iban: h.existing.iban,
        count: 1,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}
