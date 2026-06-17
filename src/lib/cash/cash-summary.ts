// Reine Berechnungs-Funktion für den vier-zeiligen Bargeld-Block der
// Tagesabrechnung. Keine Server-Aufrufe, keine UI.
//
// - Tages-Bargeld = computeDailyCash(dayInput)
// - cashActual == null → Differenz null, Tresor = Tages-Bargeld
// - sonst Differenz = cashActual − cashTarget,
//         Tresor    = Tages-Bargeld − Differenz

import { computeDailyCash, type DayInput } from "./cash-ledger";

export type SummaryRows = {
  tagesBargeldCents: number;
  differenzCents: number | null;
  tresorCents: number;
};

export function computeSummaryRows(args: {
  dayInput: DayInput;
  cashActualCents: number | null;
  cashTargetCents: number;
}): SummaryRows {
  const tagesBargeldCents = computeDailyCash(args.dayInput);
  if (args.cashActualCents == null) {
    return {
      tagesBargeldCents,
      differenzCents: null,
      tresorCents: tagesBargeldCents,
    };
  }
  const differenzCents = args.cashActualCents - args.cashTargetCents;
  return {
    tagesBargeldCents,
    differenzCents,
    tresorCents: tagesBargeldCents - differenzCents,
  };
}
