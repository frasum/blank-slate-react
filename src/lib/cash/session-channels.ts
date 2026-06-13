// Reine Aggregations-Funktion für die Tages-Einnahmen einer Session (B3a).
//
// Quelle: Altsystem `sessions` mit festen Spalten je Plattform/Terminal
// plus Korrektur-Feldern. COCO normalisiert das auf:
//
//   gross_revenue =
//       Σ session_channel_amounts      (POS, Lieferplattformen, …)
//     + Σ session_terminal_amounts      (Kartenterminals)
//     + sonstige_einnahme
//     − opentabs_deduction
//     − vorschuss
//     − einladung
//
// Gutscheine (sold/redeemed/finedine) sind separat aufgeführt — sie
// gehen NICHT in `gross_revenue` ein, sondern in den Tages-Cash-Delta
// (siehe cash-ledger.ts). Begründung: Verkauf erhöht Kasse OHNE Umsatz
// (Gutschein ist Verbindlichkeit), Einlösung mindert Kasse-Eingang OHNE
// Umsatz-Minderung — Trennung ist Pflicht für korrekten Saldo.
//
// Diese Funktion ist die EINE Stelle, an der die Aggregation passiert
// (Altsystem hatte sie über DB-Funktion + Client-Hook verteilt). Bei
// Konflikt mit Altsystem-Hook `useCashBalanceData`: MELDEN, nicht raten.

export type SessionAggregateInput = {
  channelAmountsCents: number[];
  terminalAmountsCents: number[];
  sonstigeEinnahmeCents: number;
  opentabsDeductionCents: number;
  vorschussCents: number;
  einladungCents: number;
};

export function aggregateSessionRevenue(input: SessionAggregateInput): {
  channelsTotalCents: number;
  terminalsTotalCents: number;
  grossRevenueCents: number;
} {
  const channelsTotalCents = sumIntegers(input.channelAmountsCents);
  const terminalsTotalCents = sumIntegers(input.terminalAmountsCents);
  const grossRevenueCents =
    channelsTotalCents +
    terminalsTotalCents +
    asInt(input.sonstigeEinnahmeCents, "sonstigeEinnahmeCents") -
    asInt(input.opentabsDeductionCents, "opentabsDeductionCents") -
    asInt(input.vorschussCents, "vorschussCents") -
    asInt(input.einladungCents, "einladungCents");
  return { channelsTotalCents, terminalsTotalCents, grossRevenueCents };
}

function asInt(value: number, name: string): number {
  if (!Number.isInteger(value)) throw new Error(`${name} must be integer cents`);
  return value;
}

function sumIntegers(values: number[]): number {
  let total = 0;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (!Number.isInteger(v)) throw new Error(`amount[${i}] must be integer cents`);
    total += v;
  }
  return total;
}
