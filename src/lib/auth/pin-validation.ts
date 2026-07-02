// Reine PIN-Validierungslogik — KEINE I/O, KEINE DB-Calls.
// Gebaut, damit Hash-Vergleich und Rate-Limit-Entscheidung
// in Vitest isoliert testbar sind (siehe pin-validation.test.ts).
//
// Vorgabe aus B1b: max 5 Fehlversuche pro Mitarbeiter in 15 Minuten.
// Bei Erreichen der Schwelle ist auch ein korrekter PIN gesperrt.

export const PIN_RATE_LIMIT_MAX = 5;
export const PIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/** Vergleich (bcrypt) wird injiziert, damit Tests synchron mocken können. */
export type PinCompareFn = (pin: string, hash: string) => Promise<boolean> | boolean;

export type PinEvaluationInput = {
  /** Gespeicherter bcrypt-Hash; null wenn Staff unbekannt oder ohne PIN. */
  storedHash: string | null;
  providedPin: string;
  /** Anzahl Fehlversuche dieses Staff innerhalb des Rate-Limit-Fensters. */
  recentFailuresInWindow: number;
  compare: PinCompareFn;
};

/**
 * Einheitliche Ergebnis-Shape. Bei jeder Ablehnung wird das gleiche
 * "rejected" zurückgegeben — der Aufrufer darf den Grund NICHT an den
 * Client durchreichen (gleiche Fehlermeldung für falsch/unbekannt/gesperrt).
 */
export type PinEvaluationOutcome =
  | { kind: "ok" }
  | { kind: "rejected"; reasonCode: "rate_limited" | "no_pin" | "mismatch" };

export async function evaluatePin(input: PinEvaluationInput): Promise<PinEvaluationOutcome> {
  if (input.recentFailuresInWindow >= PIN_RATE_LIMIT_MAX) {
    return { kind: "rejected", reasonCode: "rate_limited" };
  }
  if (!input.storedHash) {
    return { kind: "rejected", reasonCode: "no_pin" };
  }
  const ok = await input.compare(input.providedPin, input.storedHash);
  return ok ? { kind: "ok" } : { kind: "rejected", reasonCode: "mismatch" };
}

/**
 * Rate-Limit-Entscheidung für den Passwort-Fallback in validatePin.
 * Gleiche Schwelle wie der PIN-Pfad: ab PIN_RATE_LIMIT_MAX Fehlversuchen
 * im Fenster wird der Kandidat gar nicht erst probiert.
 */
export function isCredentialAttemptAllowed(recentFailuresInWindow: number): boolean {
  return recentFailuresInWindow < PIN_RATE_LIMIT_MAX;
}
