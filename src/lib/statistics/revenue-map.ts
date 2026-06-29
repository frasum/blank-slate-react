/**
 * M-Statistik — DB-Row → reine `SessionRevenueInput[]`-Liste.
 *
 * Keine DB-Zugriffe, keine Seiteneffekte. Wandelt die rohen DB-Zeilen
 * (sessions + session_channel_amounts joined revenue_channels.is_takeaway)
 * in die Eingabe-Struktur der reinen Funktionen aus `revenue-core.ts`.
 *
 * TSB-Hinweis (offen): TSB hat zusätzlich einen `pos`-Kanal „Kasse". Ob TSB
 * `vectronCents` UND diesen Kanal gleichzeitig füllt, ist noch zu
 * verifizieren. Diese Funktion behandelt das NICHT speziell — sie reicht
 * 1:1 weiter, was die Server-Fn aus der DB liest.
 */

import type { SessionRevenueInput } from "./revenue-core";

export type SessionRow = {
  id: string;
  businessDate: string;
  locationId: string;
  vectronCents: number;
};

export type ChannelAmountRow = {
  sessionId: string;
  amountCents: number;
  isTakeaway: boolean;
};

export function mapToSessionInputs(
  sessions: SessionRow[],
  channelAmounts: ChannelAmountRow[],
): SessionRevenueInput[] {
  const bySession = new Map<string, { amountCents: number; isTakeaway: boolean }[]>();
  for (const ca of channelAmounts) {
    const list = bySession.get(ca.sessionId);
    const entry = { amountCents: ca.amountCents, isTakeaway: ca.isTakeaway };
    if (list) list.push(entry);
    else bySession.set(ca.sessionId, [entry]);
  }
  return sessions.map((s) => ({
    sessionId: s.id,
    businessDate: s.businessDate,
    locationId: s.locationId,
    vectronCents: s.vectronCents,
    channels: bySession.get(s.id) ?? [],
  }));
}
