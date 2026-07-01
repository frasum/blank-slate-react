// Reine Funktion: bestimmt aus einem Service-Schicht-Start (HH:MM,
// Europe/Berlin) und einem Abgabe-Zeitpunkt (ISO) das
// Pool-Ende-Ergebnis für den Service-Kellner.
//
// Regeln (siehe Bauplan „Service-Pool-Ende aus Abrechnungsabgabe"):
//   * shiftStartHHMM null → null (kein Service-Start → kein Eintrag).
//   * Berlin-lokale Stunde/Minute des `submissionIso` bestimmt shiftEnd.
//   * dayOffset = 0, wenn end >= start (regulär).
//   * dayOffset = 1, wenn end < start UND end < 03:00 (Wrap über
//     Mitternacht, Geschäftstag-Cutoff).
//   * end < start und end >= 03:00 → null (Abgabe vor Schichtbeginn,
//     unplausibel — kein Eintrag).

const BERLIN = "Europe/Berlin";

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BERLIN,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function berlinHHMM(iso: string): { hh: string; mm: string; minutes: number } {
  const parts = partsFormatter.formatToParts(new Date(iso));
  const get = (t: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === t)?.value ?? "00";
  const hourRaw = get("hour");
  const hh = hourRaw === "24" ? "00" : hourRaw.padStart(2, "0");
  const mm = get("minute").padStart(2, "0");
  return { hh, mm, minutes: Number(hh) * 60 + Number(mm) };
}

function toMinutes(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
}

export type ResolveServicePoolEndInput = {
  shiftStartHHMM: string | null;
  submissionIso: string;
  businessDate: string;
};

export type ResolveServicePoolEndResult = {
  shiftEndHHMM: string;
  dayOffset: 0 | 1;
  hoursMinutes: number;
};

export function resolveServicePoolEnd(
  input: ResolveServicePoolEndInput,
): ResolveServicePoolEndResult | null {
  if (!input.shiftStartHHMM) return null;
  const start = toMinutes(input.shiftStartHHMM);
  const { hh, mm, minutes: end } = berlinHHMM(input.submissionIso);
  const shiftEndHHMM = `${hh}:${mm}`;
  if (end >= start) {
    return { shiftEndHHMM, dayOffset: 0, hoursMinutes: end - start };
  }
  // end < start
  if (end < 3 * 60) {
    // Echter Wrap über Mitternacht (Geschäftstag-Cutoff 03:00).
    return {
      shiftEndHHMM,
      dayOffset: 1,
      hoursMinutes: end + 24 * 60 - start,
    };
  }
  // Abgabe vor Schichtbeginn → unplausibel, kein Eintrag.
  return null;
}