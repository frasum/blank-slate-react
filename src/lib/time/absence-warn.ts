// UA1 — Reine Regel: soll das Einstempeln vor einem Abwesenheits-Eintrag
// gewarnt werden? Kein I/O, keine DB. Wird VOR dem Schreibpfad geprüft,
// nachdem der Aufrufer die roster_absence-Zeile des heutigen business_date
// geladen hat.

export type AbsenceType = "urlaub" | "krank";

export type AbsenceWarnInput = {
  absenceToday: AbsenceType | null;
  confirmed: boolean;
};

export type AbsenceWarnDecision =
  | { warn: false }
  | { warn: true; type: AbsenceType }
  | { override: true; type: AbsenceType };

export function shouldWarnAbsenceClockIn(input: AbsenceWarnInput): AbsenceWarnDecision {
  if (input.absenceToday === null) return { warn: false };
  if (input.confirmed) return { override: true, type: input.absenceToday };
  return { warn: true, type: input.absenceToday };
}

// Fehler-Code, den der Server bei nicht bestätigter Abwesenheit wirft.
// UI parst diesen Prefix, um den Bestätigungs-Dialog zu öffnen.
export const ABSENCE_TODAY_ERROR_PREFIX = "ABSENCE_TODAY:";

export function absenceTodayError(type: AbsenceType): string {
  return `${ABSENCE_TODAY_ERROR_PREFIX}${type}`;
}

export function parseAbsenceTodayError(message: string): AbsenceType | null {
  if (!message.startsWith(ABSENCE_TODAY_ERROR_PREFIX)) return null;
  const rest = message.slice(ABSENCE_TODAY_ERROR_PREFIX.length).trim();
  if (rest === "urlaub" || rest === "krank") return rest;
  return null;
}