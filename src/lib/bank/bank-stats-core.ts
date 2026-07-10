// Aggregate für die Bankkonto-Übersicht (BK1). Reines Modul, ohne IO.

export type StatsTx = {
  buchungstag: string; // ISO YYYY-MM-DD
  betragCents: number;
  saldoCents: number | null;
  gegenpartei: string;
  categoryId: string | null; // aufgelöste Kategorie (Override oder Regel)
};

export type MonthAgg = { month: string; einCents: number; ausCents: number; nettoCents: number };

export type CategoryMonthRow = {
  categoryId: string | null; // null = "Ohne Kategorie"
  categoryName: string;
  monthly: Record<string, number>; // "YYYY-MM" -> Netto-Betrag (Cents)
  totalCents: number;
};

export type CounterpartySum = { name: string; sumCents: number; count: number };

export type BankStats = {
  totalInCents: number;
  totalOutCents: number;
  nettoCents: number;
  count: number;
  startSaldoCents: number | null;
  endSaldoCents: number | null;
  monthly: MonthAgg[];
  categoryMonth: {
    months: string[];
    rows: CategoryMonthRow[];
  };
  topIn: CounterpartySum[];
  topOut: CounterpartySum[];
};

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/**
 * @param txs bereits chronologisch sortiert (aufsteigend nach buchungstag).
 * @param categoriesById Id -> Name Map für die Anzeige.
 * @param topN wie viele Top-Gegenparteien je Richtung.
 */
export function buildBankStats(
  txs: readonly StatsTx[],
  categoriesById: ReadonlyMap<string, string>,
  topN = 10,
): BankStats {
  let totalIn = 0;
  let totalOut = 0;
  const monthMap = new Map<string, MonthAgg>();
  const catMonthMap = new Map<string | null, Map<string, number>>();
  const monthsSet = new Set<string>();
  const cpIn = new Map<string, CounterpartySum>();
  const cpOut = new Map<string, CounterpartySum>();

  for (const tx of txs) {
    if (tx.betragCents >= 0) totalIn += tx.betragCents;
    else totalOut += tx.betragCents;
    const mk = monthKey(tx.buchungstag);
    monthsSet.add(mk);
    const m = monthMap.get(mk) ?? { month: mk, einCents: 0, ausCents: 0, nettoCents: 0 };
    if (tx.betragCents >= 0) m.einCents += tx.betragCents;
    else m.ausCents += tx.betragCents;
    m.nettoCents += tx.betragCents;
    monthMap.set(mk, m);

    const catKey = tx.categoryId;
    let cm = catMonthMap.get(catKey);
    if (!cm) {
      cm = new Map();
      catMonthMap.set(catKey, cm);
    }
    cm.set(mk, (cm.get(mk) ?? 0) + tx.betragCents);

    const name = tx.gegenpartei || "(unbekannt)";
    if (tx.betragCents > 0) {
      const e = cpIn.get(name) ?? { name, sumCents: 0, count: 0 };
      e.sumCents += tx.betragCents;
      e.count += 1;
      cpIn.set(name, e);
    } else if (tx.betragCents < 0) {
      const e = cpOut.get(name) ?? { name, sumCents: 0, count: 0 };
      e.sumCents += tx.betragCents;
      e.count += 1;
      cpOut.set(name, e);
    }
  }

  const monthly = [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month));
  const months = [...monthsSet].sort();

  const rows: CategoryMonthRow[] = [];
  for (const [catKey, mMap] of catMonthMap) {
    const monthly: Record<string, number> = {};
    let total = 0;
    for (const [mk, v] of mMap) {
      monthly[mk] = v;
      total += v;
    }
    const name = catKey == null ? "Ohne Kategorie" : (categoriesById.get(catKey) ?? "(gelöscht)");
    rows.push({ categoryId: catKey, categoryName: name, monthly, totalCents: total });
  }
  // Ohne-Kategorie oben, danach nach absolutem Volumen abwärts.
  rows.sort((a, b) => {
    if (a.categoryId == null) return -1;
    if (b.categoryId == null) return 1;
    return Math.abs(b.totalCents) - Math.abs(a.totalCents);
  });

  const startSaldo =
    txs.length > 0 && txs[0].saldoCents != null ? txs[0].saldoCents - txs[0].betragCents : null;
  const endSaldo = txs.length > 0 ? (txs[txs.length - 1].saldoCents ?? null) : null;

  const topIn = [...cpIn.values()].sort((a, b) => b.sumCents - a.sumCents).slice(0, topN);
  const topOut = [...cpOut.values()].sort((a, b) => a.sumCents - b.sumCents).slice(0, topN);

  return {
    totalInCents: totalIn,
    totalOutCents: totalOut,
    nettoCents: totalIn + totalOut,
    count: txs.length,
    startSaldoCents: startSaldo,
    endSaldoCents: endSaldo,
    monthly,
    categoryMonth: { months, rows },
    topIn,
    topOut,
  };
}
