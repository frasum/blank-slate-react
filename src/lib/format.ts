// Zentrale, byte-identische Format-Helfer. Nur Funktionen aufnehmen, die in
// allen Aufrufstellen exakt gleich implementiert sind — divergente Varianten
// (z.B. parseEuroToCents, fmtTime) bleiben bewusst lokal.

export function fmtCents(c: number | null | undefined): string {
  const v = (c ?? 0) / 100;
  return v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function parseIso(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

/**
 * Wall-clock „heute" in Europe/Berlin als YYYY-MM-DD.
 * Zwischen 00:00 und 02:00 Ortszeit liegt UTC noch im Vortag — deshalb
 * bewusst Berlin und nicht UTC oder Browser-Lokalzeit.
 * Für Geschäftstag-Logik (3-Uhr-Cutoff) siehe `businessDateOf`.
 */
export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export type ParseEuroOptions = {
  emptyAs?: 0 | null; // default: null
  allowNegative?: boolean; // default: false
};

/**
 * Parst deutsche Geld-Eingaben eindeutig nach Cent.
 * - Komma = Dezimaltrenner; bei vorhandenem Komma sind alle Punkte Tausendertrenner.
 * - Ohne Komma: genau ein Punkt mit 1–2 Nachkommastellen = Dezimaltrenner; mehrere Punkte = ungültig.
 * - Ergebnis muss `^\d+(\.\d{1,2})?$` entsprechen, sonst null.
 */
export function parseEuroToCents(value: string, opts?: ParseEuroOptions): number | null {
  const emptyAs = opts?.emptyAs ?? null;
  const allowNegative = opts?.allowNegative ?? false;

  let s = value.trim();
  if (s === "") return emptyAs;

  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }

  if (s.includes(",")) {
    if ((s.match(/,/g) ?? []).length > 1) return null;
    s = s.replace(/\./g, "").replace(",", ".");
  } else if ((s.match(/\./g) ?? []).length > 1) {
    return null;
  }

  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;

  let n = Number.parseFloat(s);
  if (!Number.isFinite(n)) return null;
  if (negative) n = -n;
  if (n < 0 && !allowNegative) return null;
  return Math.round(n * 100);
}
