/**
 * M-Statistik — reine Umsatz-/Aggregations-Funktionen.
 *
 * Alle Beträge sind ganzzahlige Cent (number). Keine Float-Cent-Rechnung,
 * keine Seiteneffekte, keine DB-Zugriffe. Die DB-Anbindung
 * (Server-Fn, sessions/revenue_channels/session_channel_amounts) lebt
 * außerhalb und speist diese Funktionen mit bereits normalisierten Inputs.
 *
 * Verifizierte Umsatzdefinition (an echten COCO-Daten bestätigt):
 * - Kanäle sind disjunkte Zeilen (kein verschachteltes Summieren).
 * - Haus    = vectronCents + Σ(Kanäle mit isTakeaway=false)
 * - Takeaway= Σ(Kanäle mit isTakeaway=true)
 * - Gesamt  = Haus + Takeaway
 *
 * TSB-Hinweis (offen, NICHT als Sonderlogik hier abbilden): TSB hat
 * zusätzlich einen `pos`-Kanal „Kasse". Ob TSB `vectronCents` UND diesen
 * Kanal gleichzeitig füllt, ist noch zu verifizieren. Diese reine Funktion
 * summiert nur, was sie bekommt — die Server-Fn muss TSB später korrekt
 * einspeisen (nie doppelt).
 */

export type ChannelAmount = { amountCents: number; isTakeaway: boolean };

export type SessionRevenueInput = {
  sessionId: string;
  businessDate: string; // "YYYY-MM-DD"
  locationId: string;
  vectronCents: number;
  channels: ChannelAmount[];
};

export type SessionRevenue = {
  houseCents: number;
  takeawayCents: number;
  totalCents: number;
};

export type DailyRevenue = {
  businessDate: string; // "YYYY-MM-DD"
  houseCents: number;
  takeawayCents: number;
  totalCents: number;
  cardCents: number;
  sessionCount: number;
};

export type PeriodSummary = {
  houseCents: number;
  takeawayCents: number;
  totalCents: number;
  daysWithRevenue: number; // Tage mit totalCents > 0
};

export type Trend = {
  deltaCents: number; // current - previous
  pct: number | null; // null, wenn previous === 0 (kein definierter Prozentwert)
};

export function sessionRevenue(input: SessionRevenueInput): SessionRevenue {
  let houseChannelCents = 0;
  let takeawayCents = 0;
  for (const ch of input.channels) {
    if (ch.isTakeaway) {
      takeawayCents += ch.amountCents;
    } else {
      houseChannelCents += ch.amountCents;
    }
  }
  const houseCents = input.vectronCents + houseChannelCents;
  return {
    houseCents,
    takeawayCents,
    totalCents: houseCents + takeawayCents,
  };
}

export function aggregateByBusinessDate(
  sessions: SessionRevenueInput[],
  cardBySession?: ReadonlyMap<string, number> | Record<string, number>,
): DailyRevenue[] {
  const getCard = (id: string): number => {
    if (!cardBySession) return 0;
    if (cardBySession instanceof Map) return cardBySession.get(id) ?? 0;
    return (cardBySession as Record<string, number>)[id] ?? 0;
  };
  const byDate = new Map<string, DailyRevenue>();
  for (const s of sessions) {
    const rev = sessionRevenue(s);
    const card = getCard(s.sessionId);
    const existing = byDate.get(s.businessDate);
    if (existing) {
      existing.houseCents += rev.houseCents;
      existing.takeawayCents += rev.takeawayCents;
      existing.totalCents += rev.totalCents;
      existing.cardCents += card;
      existing.sessionCount += 1;
    } else {
      byDate.set(s.businessDate, {
        businessDate: s.businessDate,
        houseCents: rev.houseCents,
        takeawayCents: rev.takeawayCents,
        totalCents: rev.totalCents,
        cardCents: card,
        sessionCount: 1,
      });
    }
  }
  return Array.from(byDate.values()).sort((a, b) =>
    a.businessDate < b.businessDate ? -1 : a.businessDate > b.businessDate ? 1 : 0,
  );
}

export function summarize(daily: DailyRevenue[]): PeriodSummary {
  let houseCents = 0;
  let takeawayCents = 0;
  let totalCents = 0;
  let daysWithRevenue = 0;
  for (const d of daily) {
    houseCents += d.houseCents;
    takeawayCents += d.takeawayCents;
    totalCents += d.totalCents;
    if (d.totalCents > 0) daysWithRevenue += 1;
  }
  return { houseCents, takeawayCents, totalCents, daysWithRevenue };
}

export function computeTrend(currentCents: number, previousCents: number): Trend {
  const deltaCents = currentCents - previousCents;
  const pct = previousCents === 0 ? null : (deltaCents / previousCents) * 100;
  return { deltaCents, pct };
}

// STAT-U2 — Take-Away je Kanal.
// Summiert `amountCents` je Kanal-Name und sortiert absteigend. Reihenfolge
// bei Gleichstand: stabil nach Kanal-Name (aufsteigend), damit die UI und
// Tests deterministisch bleiben.
export type TakeawayChannel = { name: string; amountCents: number };

export function groupTakeawayByChannel(
  rows: readonly { name: string; amountCents: number }[],
): TakeawayChannel[] {
  const acc = new Map<string, number>();
  for (const r of rows) {
    acc.set(r.name, (acc.get(r.name) ?? 0) + r.amountCents);
  }
  return Array.from(acc.entries())
    .map(([name, amountCents]) => ({ name, amountCents }))
    .sort((a, b) => b.amountCents - a.amountCents || a.name.localeCompare(b.name));
}

// Prozent-Verteilung mit Largest-Remainder-Rundung. Σ der ganzzahligen
// `pct`-Werte ist genau 100, außer bei leerer Liste oder Gesamtsumme 0
// (dann alle 0 bzw. leeres Ergebnis).
export type TakeawayChannelPct = TakeawayChannel & { pct: number };

export function computeChannelPercents(
  items: readonly TakeawayChannel[],
): TakeawayChannelPct[] {
  if (items.length === 0) return [];
  const total = items.reduce((s, i) => s + i.amountCents, 0);
  if (total <= 0) return items.map((i) => ({ ...i, pct: 0 }));
  const raw = items.map((i, idx) => {
    const exact = (i.amountCents / total) * 100;
    const floor = Math.floor(exact);
    return { idx, floor, frac: exact - floor };
  });
  let assigned = raw.reduce((s, r) => s + r.floor, 0);
  let remainder = 100 - assigned;
  // Größte Fraktion zuerst; Gleichstand → höherer Betrag → kleinerer idx.
  const order = [...raw].sort(
    (a, b) =>
      b.frac - a.frac ||
      items[b.idx].amountCents - items[a.idx].amountCents ||
      a.idx - b.idx,
  );
  const bonus = new Array(items.length).fill(0);
  for (let k = 0; k < order.length && remainder > 0; k++) {
    bonus[order[k].idx] = 1;
    remainder--;
  }
  return items.map((i, idx) => ({ ...i, pct: raw[idx].floor + bonus[idx] }));
}
