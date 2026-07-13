// N13 (Nachprüfung 13.07.): formatShortDate und formatShortDateTime
// behandelten Zeitstempel früher unterschiedlich (UTC-Datumsteil vs.
// Browser-Lokalzeit) — nahe Mitternacht zeigten sie verschiedene Tage
// für denselben Wert. Beide Formatter normalisieren Zeitstempel jetzt
// einheitlich über Europe/Berlin. Reine Datums-Strings (YYYY-MM-DD)
// bleiben WORTWÖRTLICH erhalten (kein Zeitzonen-Shift), damit
// bestehende Kalender-Aufrufer identisch bleiben.

const WEEKDAYS_DE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"] as const;
const BERLIN = "Europe/Berlin";

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoDate(iso: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function pad2(n: number | string): string {
  return String(n).padStart(2, "0");
}

const berlinDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: BERLIN,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const berlinTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: BERLIN,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function berlinYmd(date: Date): { y: number; m: number; d: number; wdIdx: number } {
  const parts = berlinDateFmt.formatToParts(date);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  const y = Number(get("year"));
  const m = Number(get("month"));
  const d = Number(get("day"));
  // Wochentag deterministisch aus den Berliner Y/M/D ableiten — nicht aus
  // dem Date-Objekt, sonst würde die Browser-Lokalzeit wieder eingreifen.
  const wdIdx = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { y, m, d, wdIdx };
}

function berlinHm(date: Date): { hh: string; mm: string } {
  const parts = berlinTimeFmt.formatToParts(date);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  // en-GB liefert "24" für Mitternacht — auf "00" normalisieren.
  const hhRaw = get("hour");
  return { hh: hhRaw === "24" ? "00" : hhRaw, mm: get("minute") };
}

/**
 * Globales Datumsformat: "Mi 01.06"
 * Akzeptiert reinen ISO-Date-String ("YYYY-MM-DD") ODER einen Zeitstempel.
 * Reine Datums-Strings werden ohne Zeitzonen-Verschiebung übernommen;
 * Zeitstempel werden in Europe/Berlin projiziert.
 */
export function formatShortDate(iso: string | Date): string {
  if (typeof iso === "string" && DATE_ONLY_RE.test(iso)) {
    const parsed = parseIsoDate(iso)!;
    const wdIdx = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d)).getUTCDay();
    return `${WEEKDAYS_DE[wdIdx]} ${pad2(parsed.d)}.${pad2(parsed.m)}`;
  }
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return typeof iso === "string" ? iso : "";
  const { m, d: day, wdIdx } = berlinYmd(d);
  return `${WEEKDAYS_DE[wdIdx]} ${pad2(day)}.${pad2(m)}`;
}

/**
 * Datum + Uhrzeit im selben Stil: "Mi 01.06 14:30"
 * Zeitstempel werden in Europe/Berlin projiziert. Reine Datums-Strings
 * (ohne Uhrzeit) werden wie formatShortDate behandelt.
 */
export function formatShortDateTime(value: string | Date): string {
  if (typeof value === "string" && DATE_ONLY_RE.test(value)) {
    return formatShortDate(value);
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return typeof value === "string" ? value : "";
  const date = formatShortDate(d);
  const { hh, mm } = berlinHm(d);
  return `${date} ${hh}:${mm}`;
}
