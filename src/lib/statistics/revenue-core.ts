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
): DailyRevenue[] {
  const byDate = new Map<string, DailyRevenue>();
  for (const s of sessions) {
    const rev = sessionRevenue(s);
    const existing = byDate.get(s.businessDate);
    if (existing) {
      existing.houseCents += rev.houseCents;
      existing.takeawayCents += rev.takeawayCents;
      existing.totalCents += rev.totalCents;
      existing.sessionCount += 1;
    } else {
      byDate.set(s.businessDate, {
        businessDate: s.businessDate,
        houseCents: rev.houseCents,
        takeawayCents: rev.takeawayCents,
        totalCents: rev.totalCents,
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

export function computeTrend(
  currentCents: number,
  previousCents: number,
): Trend {
  const deltaCents = currentCents - previousCents;
  const pct = previousCents === 0 ? null : (deltaCents / previousCents) * 100;
  return { deltaCents, pct };
}