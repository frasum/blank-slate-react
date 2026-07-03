// Reines Modul für die BWA-Rechenlogik (Modul M-BWA, Welle F1).
//
// - `deriveBwa` berechnet die abgeleiteten Kennzahlen aus den erfassten
//   BWA-Zeilen (Gesamtleistung, Rohertrag I/II, Ergebnis op. Tätigkeit,
//   Betriebsergebnis-Soll) — genau EINE Formel, nirgendwo dupliziert.
// - `validateBwaMonth` prüft zwei Quersummen (Betriebsergebnis + Umsatz)
//   gegen die eingegebenen Werte. Toleranz ±300 Cent, weil die BWA-Blätter
//   des Steuerberaters auf ganze Euro gerundet sind.
//
// Bewusst keine DB-Aufrufe, keine Zod-Schemata — reines TypeScript, damit die
// Tests im Node-Runner ohne Netz laufen.

export type BwaMonthInput = {
  umsatzCents: number;
  getraenkeCents: number;
  speisenHausCents: number;
  speisenAusserHausCents: number;
  sonstigeErloeseCents: number;
  sonstErtraegeCents: number;
  wareneinsatzCents: number;
  personalCents: number;
  sachkostenCents: number;
  anlageCents: number;
  abschreibungCents: number;
  betriebsergebnisCents: number;
};

export type BwaDerived = {
  gesamtleistungCents: number;
  rohertrag1Cents: number;
  rohertrag2Cents: number;
  ergebnisOpCents: number;
  betriebsergebnisSollCents: number;
};

export function deriveBwa(input: BwaMonthInput): BwaDerived {
  const gesamtleistungCents = input.umsatzCents + input.sonstErtraegeCents;
  const rohertrag1Cents = gesamtleistungCents - input.wareneinsatzCents;
  const rohertrag2Cents = rohertrag1Cents - input.personalCents;
  const ergebnisOpCents = rohertrag2Cents - input.sachkostenCents;
  const betriebsergebnisSollCents = ergebnisOpCents - input.anlageCents - input.abschreibungCents;
  return {
    gesamtleistungCents,
    rohertrag1Cents,
    rohertrag2Cents,
    ergebnisOpCents,
    betriebsergebnisSollCents,
  };
}

export type BwaValidationResult = { ok: true } | { ok: false; errors: string[] };

/** Toleranz für Quersummen-Checks (ganze Euro auf der BWA → 300 Cent = 3 €). */
export const BWA_TOLERANCE_CENTS = 300;

function fmtEuro(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function validateBwaMonth(input: BwaMonthInput): BwaValidationResult {
  const errors: string[] = [];
  const derived = deriveBwa(input);

  const diffBe = Math.abs(input.betriebsergebnisCents - derived.betriebsergebnisSollCents);
  if (diffBe > BWA_TOLERANCE_CENTS) {
    errors.push(
      `Betriebsergebnis passt nicht zur Quersumme: eingegeben ${fmtEuro(
        input.betriebsergebnisCents,
      )}, berechnet ${fmtEuro(derived.betriebsergebnisSollCents)}.`,
    );
  }

  const umsatzSum =
    input.getraenkeCents +
    input.speisenHausCents +
    input.speisenAusserHausCents +
    input.sonstigeErloeseCents;
  const diffUm = Math.abs(input.umsatzCents - umsatzSum);
  if (diffUm > BWA_TOLERANCE_CENTS) {
    errors.push(
      `Umsatz passt nicht zur Quersumme der Erlöskonten: eingegeben ${fmtEuro(
        input.umsatzCents,
      )}, berechnet ${fmtEuro(umsatzSum)}.`,
    );
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}