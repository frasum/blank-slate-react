// SP2 — Reiner Helfer: leitet aus einer Startzeit ein Anzeige-Label
// „Früh" / „Mittag" / „Abend" ab. Zwei Grenzen:
//   Startzeit < PERIOD_FRUEH_BIS (11:00 Ortszeit)         = „Früh"
//   PERIOD_FRUEH_BIS ≤ … < DISPLAY_PERIOD_SWITCH_HOUR     = „Mittag"
//   ab DISPLAY_PERIOD_SWITCH_HOUR (15:00 Ortszeit)        = „Abend"
//
// Nur Anzeige — niemals gespeichert. Die Uhrzeit bleibt die einzige
// Wahrheit; das Label wird bei jeder Anzeige neu berechnet.
//
// Keine DB-, Netz- oder Uhrzeit-Abhängigkeiten außer der übergebenen
// Zeitzone. Tests liegen in period-label.test.ts.

export const PERIOD_FRUEH_BIS = 11;
export const DISPLAY_PERIOD_SWITCH_HOUR = 15;

export type DerivedPeriodLabel = "Früh" | "Mittag" | "Abend";

/**
 * Liest die Stunde einer ISO-Startzeit in der angegebenen Zeitzone
 * und liefert das passende Fenster-Label.
 */
export function derivePeriodLabel(
  startedAtIso: string,
  timeZone: string = "Europe/Berlin",
): DerivedPeriodLabel {
  const d = new Date(startedAtIso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`derivePeriodLabel: ungültige Startzeit ${startedAtIso}`);
  }
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  // Intl liefert für Mitternacht in en-GB gelegentlich "24" — auf 0 normieren.
  const hour = Number(hh) % 24;
  if (hour < PERIOD_FRUEH_BIS) return "Früh";
  if (hour < DISPLAY_PERIOD_SWITCH_HOUR) return "Mittag";
  return "Abend";
}
