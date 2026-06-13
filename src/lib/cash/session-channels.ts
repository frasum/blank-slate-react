// Aggregation der Session-Einnahmen aus den DB-Tabellen
// `session_channel_amounts` + `session_terminal_amounts` (B3-Modellkorrektur,
// Teil B). Der Reader liefert für jede Session-Reihe ein `kind` mit, das
// aus dem zugehörigen `revenue_channels.kind` stammt. Diese Aggregation
// gruppiert die Kanal-Beträge nach Kind und macht die Formel-Eingaben
// für `cash-ledger` direkt verfügbar — die UI muss keine kind-Splittung
// machen. `kind` ist technisch-neutral (kein Anbietername — der
// historische "ordersmart"-Kanal heißt jetzt `delivery_souse`).

import type { DayInput } from "./cash-ledger";

export type ChannelKind =
  | "pos"
  | "delivery_souse"
  | "delivery_wolt"
  | "voucher_sold"
  | "voucher_redeemed"
  | "finedine"
  | "einladung"
  | "sonstige";

export const CHANNEL_KINDS: readonly ChannelKind[] = [
  "pos",
  "delivery_souse",
  "delivery_wolt",
  "voucher_sold",
  "voucher_redeemed",
  "finedine",
  "einladung",
  "sonstige",
] as const;

export type ChannelAmountRow = { kind: ChannelKind; amountCents: number };
export type TerminalAmountRow = { amountCents: number };

export type ChannelTotalsByKind = Record<ChannelKind, number>;

export type AggregatedChannels = {
  byKind: ChannelTotalsByKind;
  cardTotalCents: number;
};

function emptyByKind(): ChannelTotalsByKind {
  return {
    pos: 0,
    delivery_souse: 0,
    delivery_wolt: 0,
    voucher_sold: 0,
    voucher_redeemed: 0,
    finedine: 0,
    einladung: 0,
    sonstige: 0,
  };
}

function asInt(v: number, name: string): number {
  if (!Number.isInteger(v)) throw new Error(`${name} must be integer cents`);
  return v;
}

/**
 * Summiert die Kanal-Beträge je `kind` und den Karten-Topf separat.
 * Liefert nur die Aggregation — die Übersetzung in DayInput-Felder
 * macht `buildDayInputFromAggregation` weiter unten.
 */
export function aggregateChannelAmounts(
  channels: ChannelAmountRow[],
  terminals: TerminalAmountRow[],
): AggregatedChannels {
  const byKind = emptyByKind();
  for (let i = 0; i < channels.length; i += 1) {
    const r = channels[i];
    byKind[r.kind] += asInt(r.amountCents, `channels[${i}].amount`);
  }
  let cardTotalCents = 0;
  for (let i = 0; i < terminals.length; i += 1) {
    cardTotalCents += asInt(terminals[i].amountCents, `terminals[${i}].amount`);
  }
  return { byKind, cardTotalCents };
}

/**
 * Baut die `DayInput`-Felder, die aus Session-Kanälen und -Terminals
 * direkt ableitbar sind. Restliche Felder (`einladungCents`,
 * `vouchersSoldCents` etc.) können wahlweise aus dem aggregierten
 * `byKind` ODER aus den Pauschal-Spalten der Session kommen — beides
 * darf nicht doppelt zählen. Wir entscheiden uns für die kind-basierte
 * Quelle, damit es genau eine Eingabe pro Größe gibt.
 */
export function buildDayInputFromAggregation(
  agg: AggregatedChannels,
): Pick<
  DayInput,
  | "grossRevenueCents"
  | "cardTotalCents"
  | "deliverySouseCents"
  | "deliveryWoltCents"
  | "vouchersSoldCents"
  | "vouchersRedeemedCents"
  | "finedineVouchersCents"
  | "einladungCents"
  | "sonstigeEinnahmeCents"
> {
  return {
    grossRevenueCents: agg.byKind.pos,
    cardTotalCents: agg.cardTotalCents,
    deliverySouseCents: agg.byKind.delivery_souse,
    deliveryWoltCents: agg.byKind.delivery_wolt,
    vouchersSoldCents: agg.byKind.voucher_sold,
    vouchersRedeemedCents: agg.byKind.voucher_redeemed,
    finedineVouchersCents: agg.byKind.finedine,
    einladungCents: agg.byKind.einladung,
    sonstigeEinnahmeCents: agg.byKind.sonstige,
  };
}
