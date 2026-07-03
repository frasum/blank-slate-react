// Reines Modul: KPI-Ableitung fuer den Jahresabschluss + VJ-Konsistenz-
// Check zwischen zwei aufeinanderfolgenden Jahresberichten.
//
// Anti-Halluzinations-Regel (gleiche Grundregel wie im Parser): Label-Anker
// werden strikt matched; fehlt der Anker, liefern wir NULL (UI zeigt „—")
// statt naechstbeste Position zu raten. Cent-Rechnung durchgaengig; nur
// die Quote ist eine Fliesskommazahl.

export type BilanzPositionRow = {
  statement: "aktiva" | "passiva" | "guv";
  code: string;
  parent_code: string | null;
  label: string;
  level: number;
  sort_order: number;
  betrag_cents: number;
  vorjahr_cents: number | null;
};

export type Which = "gj" | "vj";

const LBL_EIGENKAPITAL = /^eigenkapital\b/i;
const LBL_KASSENBESTAND = /kassenbestand|guthaben\s+bei\s+kreditinstituten/i;
const LBL_JAHRESUEBERSCHUSS = /jahres(ü|ue)bersch(uss|üsse)|jahresfehlbetrag/i;

function value(pos: BilanzPositionRow, which: Which): number | null {
  return which === "gj" ? pos.betrag_cents : pos.vorjahr_cents;
}

export function bilanzsummeCents(positions: BilanzPositionRow[], which: Which): number | null {
  const top = positions.filter((p) => p.statement === "aktiva" && p.level === 0);
  if (top.length === 0) return null;
  let sum = 0;
  for (const p of top) {
    const v = value(p, which);
    if (v === null) return null;
    sum += v;
  }
  return sum;
}

export function eigenkapitalCents(positions: BilanzPositionRow[], which: Which): number | null {
  const anchor = positions.find(
    (p) => p.statement === "passiva" && p.level === 0 && LBL_EIGENKAPITAL.test(p.label),
  );
  if (!anchor) return null;
  return value(anchor, which);
}

export function eigenkapitalquote(positions: BilanzPositionRow[], which: Which): number | null {
  const ek = eigenkapitalCents(positions, which);
  const bs = bilanzsummeCents(positions, which);
  if (ek === null || bs === null || bs === 0) return null;
  return ek / bs;
}

export function liquideMittelCents(positions: BilanzPositionRow[], which: Which): number | null {
  // Anker: irgendeine Aktiva-Position (Level beliebig) mit Label
  // „Kassenbestand …" oder „Guthaben bei Kreditinstituten". Mehrere
  // Treffer → Summe (typisch: Kassenbestand + Bankguthaben, separat).
  const hits = positions.filter((p) => p.statement === "aktiva" && LBL_KASSENBESTAND.test(p.label));
  if (hits.length === 0) return null;
  let sum = 0;
  for (const p of hits) {
    const v = value(p, which);
    if (v === null) return null;
    sum += v;
  }
  return sum;
}

export function jahresueberschussCents(
  positions: BilanzPositionRow[],
  which: Which,
): number | null {
  const anchor = positions.find(
    (p) => p.statement === "guv" && p.level === 0 && LBL_JAHRESUEBERSCHUSS.test(p.label),
  );
  if (!anchor) return null;
  return value(anchor, which);
}

export type BilanzKpiValue = { cents: number | null; missing: boolean };

export type BilanzKpis = {
  bilanzsumme: BilanzKpiValue;
  eigenkapital: BilanzKpiValue;
  eigenkapitalquote: { value: number | null; missing: boolean };
  liquideMittel: BilanzKpiValue;
  jahresueberschuss: BilanzKpiValue;
};

function wrap(cents: number | null): BilanzKpiValue {
  return { cents, missing: cents === null };
}

export function deriveBilanzKpis(positions: BilanzPositionRow[], which: Which): BilanzKpis {
  return {
    bilanzsumme: wrap(bilanzsummeCents(positions, which)),
    eigenkapital: wrap(eigenkapitalCents(positions, which)),
    eigenkapitalquote: (() => {
      const q = eigenkapitalquote(positions, which);
      return { value: q, missing: q === null };
    })(),
    liquideMittel: wrap(liquideMittelCents(positions, which)),
    jahresueberschuss: wrap(jahresueberschussCents(positions, which)),
  };
}

// ---------------------------------------------------------------------------
// VJ-Konsistenz zwischen zwei aufeinanderfolgenden Berichten
// ---------------------------------------------------------------------------

export type VjConsistencyMismatch = {
  statement: "aktiva" | "passiva" | "guv";
  code: string;
  label: string;
  reportVjCents: number; // VJ-Spalte im Bericht des spaeteren Jahres
  prevGjCents: number; // GJ-Wert derselben Position im Vorjahres-Bericht
  diffCents: number;
};

/**
 * Vergleicht die VJ-Spalte des spaeteren Berichts (yearN) mit der
 * GJ-Spalte desselben Postens im Vorjahresbericht (yearNMinus1).
 * Nur Top-Level-Positionen; fehlender Match auf einer Seite → ignoriert.
 */
export function findVjConsistencyMismatches(
  yearNPositions: BilanzPositionRow[],
  yearNMinus1Positions: BilanzPositionRow[],
): VjConsistencyMismatch[] {
  const prev = new Map<string, BilanzPositionRow>();
  for (const p of yearNMinus1Positions) {
    if (p.level !== 0) continue;
    prev.set(`${p.statement}::${p.code}`, p);
  }
  const mismatches: VjConsistencyMismatch[] = [];
  for (const p of yearNPositions) {
    if (p.level !== 0) continue;
    if (p.vorjahr_cents === null) continue;
    const match = prev.get(`${p.statement}::${p.code}`);
    if (!match) continue;
    if (match.betrag_cents === p.vorjahr_cents) continue;
    mismatches.push({
      statement: p.statement,
      code: p.code,
      label: p.label,
      reportVjCents: p.vorjahr_cents,
      prevGjCents: match.betrag_cents,
      diffCents: p.vorjahr_cents - match.betrag_cents,
    });
  }
  return mismatches;
}
