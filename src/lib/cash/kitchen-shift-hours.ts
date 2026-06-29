// Reine Funktion zur Umrechnung manuell eingegebener Küchenschichten
// (Start/Ende als "HH:MM") in eine Dauer in Minuten — analog der
// Legacy-tagesabrechnung-Rubrik „Küchentrinkgeld".
//
// Mitternachts-Wrap wie Legacy: end > start → end − start;
// end < start → end + 1440 − start.
//
// BEWUSSTE ABWEICHUNG vom Legacy-Quirk: start === end → 0 Minuten
// (Legacy interpretierte das als 24 h). Hintergrund: ein Tippfehler darf
// keine 24-Stunden-Schicht erzeugen. Wer wirklich 24 h erfassen möchte,
// gibt das über zwei Einträge oder den Schalter-aus-Pfad ein.

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function parseHHMM(value: string, field: string): number {
  const m = HHMM.exec(value.trim());
  if (!m) throw new Error(`${field}: ungültiges Zeitformat (erwartet HH:MM).`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function kitchenShiftMinutes(start: string, end: string): number {
  const s = parseHHMM(start, "Start");
  const e = parseHHMM(end, "Ende");
  if (e === s) return 0;
  if (e > s) return e - s;
  return e + 1440 - s;
}