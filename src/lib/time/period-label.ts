// SP1b — Reiner Helfer: leitet aus einer Startzeit ein Anzeige-Label
// „Mittag"/„Abend" ab. Regel: Startzeit vor DISPLAY_PERIOD_SWITCH_HOUR
// (15:00 Ortszeit) = „Mittag", ab 15:00 = „Abend".
//
// Nur Anzeige — niemals gespeichert. Die Uhrzeit bleibt die einzige
// Wahrheit; das Label wird bei jeder Anzeige neu berechnet.
//
// Keine DB-, Netz- oder Uhrzeit-Abhängigkeiten außer der übergebenen
// Zeitzone. Tests liegen in period-label.test.ts.

export const DISPLAY_PERIOD_SWITCH_HOUR = 15;

export type DerivedPeriodLabel = "Mittag" | "Abend";

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
  return hour < DISPLAY_PERIOD_SWITCH_HOUR ? "Mittag" : "Abend";
}