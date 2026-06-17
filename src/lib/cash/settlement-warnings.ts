// Reine Vergleichslogik für Settlement-Warnungen (POS- und Terminal-Differenz).
// Keine Geld-Berechnung — nur ein Soll/Ist-Abgleich auf bereits aggregierten
// Werten. Eingabevalidierung analog `waiter-settlement.ts`: alle Beträge
// müssen ganzzahlige Cents sein.

export type SettlementWarning =
  | {
      kind: "pos_diff";
      posTotalCents: number;
      waiterPosCents: number;
      deliveryCents: number;
      diffCents: number;
    }
  | {
      kind: "terminal_diff";
      terminalsCents: number;
      waiterCardCents: number;
      diffCents: number;
    };

export type SettlementWarningInput = {
  hasSettlements: boolean;
  posTotalCents: number;
  deliveryVectronCents: number;
  deliverySouseCents: number;
  deliveryWoltCents: number;
  terminalsTotalCents: number;
  waiterPosSalesCents: number[];
  waiterCardTotalCents: number[];
};

function asInt(v: number, name: string): number {
  if (!Number.isInteger(v)) throw new Error(`${name} must be integer cents`);
  return v;
}

function sumInts(arr: number[], name: string): number {
  let s = 0;
  for (let i = 0; i < arr.length; i += 1) s += asInt(arr[i], `${name}[${i}]`);
  return s;
}

export function computeSettlementWarnings(input: SettlementWarningInput): SettlementWarning[] {
  if (!input.hasSettlements) return [];

  const posTotal = asInt(input.posTotalCents, "posTotalCents");
  const deliveryVectron = asInt(input.deliveryVectronCents, "deliveryVectronCents");
  const deliverySouse = asInt(input.deliverySouseCents, "deliverySouseCents");
  const deliveryWolt = asInt(input.deliveryWoltCents, "deliveryWoltCents");
  const terminalsTotal = asInt(input.terminalsTotalCents, "terminalsTotalCents");
  const waiterPos = sumInts(input.waiterPosSalesCents, "waiterPosSalesCents");
  const waiterCard = sumInts(input.waiterCardTotalCents, "waiterCardTotalCents");

  const delivery = deliveryVectron + deliverySouse + deliveryWolt;
  const posDiff = posTotal - waiterPos - delivery;
  const terminalDiff = terminalsTotal - waiterCard;

  const warnings: SettlementWarning[] = [];
  if (Math.abs(posDiff) >= 1) {
    warnings.push({
      kind: "pos_diff",
      posTotalCents: posTotal,
      waiterPosCents: waiterPos,
      deliveryCents: delivery,
      diffCents: posDiff,
    });
  }
  if (Math.abs(terminalDiff) >= 1) {
    warnings.push({
      kind: "terminal_diff",
      terminalsCents: terminalsTotal,
      waiterCardCents: waiterCard,
      diffCents: terminalDiff,
    });
  }
  return warnings;
}