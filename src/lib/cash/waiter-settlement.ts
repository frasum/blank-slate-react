// Reine Rechenfunktion für die Kellner-Abrechnung (B3a).
//
// Quelle: Altsystem `waiter_shifts` mit zwei GENERATED-Spalten:
//   differenz   = pos_sales + hilf_mahl − open_invoices − card_total
//   kitchen_tip = pos_sales * 0.02
//
// In COCO:
//   * Alle Beträge in ganzzahligen Cents (BIGINT in der DB).
//   * `kitchen_tip_rate` ist Org-Einstellung (Default 0.0200) und wird
//     je Settlement als Snapshot persistiert — Änderung der Rate
//     beeinflusst nie eine bereits abgegebene Abrechnung.
//   * Rundung des Trinkgelds: kaufmännisch (round-half-away-from-zero)
//     auf ganze Cents. Dokumentiert + getestet.
//   * `differenz` darf negativ sein (Kellner hat zu wenig abgegeben).

export type WaiterSettlementInput = {
  posSalesCents: number;
  cardTotalCents: number;
  hilfMahlCents: number;
  openInvoicesCents: number;
  kitchenTipRate: number;
};

export type WaiterSettlementResult = {
  differenzCents: number;
  kitchenTipCents: number;
};

/**
 * Kaufmännische Rundung auf ganze Zahl. `Math.round` rundet in JS
 * Half-to-Even bei negativen Zahlen NICHT korrekt für unsere Zwecke;
 * wir erzwingen Half-Away-From-Zero, damit das Vorzeichen-Verhalten
 * vorhersagbar ist (Altsystem: positive Beträge, also kein Drift).
 */
function roundHalfAwayFromZero(value: number): number {
  return value >= 0 ? Math.floor(value + 0.5) : -Math.floor(-value + 0.5);
}

export function calcWaiterSettlement(input: WaiterSettlementInput): WaiterSettlementResult {
  const { posSalesCents, cardTotalCents, hilfMahlCents, openInvoicesCents, kitchenTipRate } = input;

  if (!Number.isInteger(posSalesCents)) throw new Error("posSalesCents must be integer cents");
  if (!Number.isInteger(cardTotalCents)) throw new Error("cardTotalCents must be integer cents");
  if (!Number.isInteger(hilfMahlCents)) throw new Error("hilfMahlCents must be integer cents");
  if (!Number.isInteger(openInvoicesCents))
    throw new Error("openInvoicesCents must be integer cents");
  if (!(kitchenTipRate >= 0 && kitchenTipRate <= 1)) throw new Error("kitchenTipRate out of [0,1]");

  const differenzCents = posSalesCents + hilfMahlCents - openInvoicesCents - cardTotalCents;
  const kitchenTipCents = roundHalfAwayFromZero(posSalesCents * kitchenTipRate);

  return { differenzCents, kitchenTipCents };
}
