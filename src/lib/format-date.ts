const WEEKDAYS_DE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"] as const;

function parseIsoDate(iso: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

/**
 * Globales Datumsformat: "Mi 01.06"
 * Akzeptiert ISO-Date ("YYYY-MM-DD") oder ISO-Timestamp.
 */
export function formatShortDate(iso: string | Date): string {
  let y: number, mo: number, d: number, wdIdx: number;
  if (iso instanceof Date) {
    y = iso.getFullYear();
    mo = iso.getMonth() + 1;
    d = iso.getDate();
    wdIdx = iso.getDay();
  } else {
    const parsed = parseIsoDate(iso);
    if (!parsed) return iso;
    ({ y, m: mo, d } = parsed);
    wdIdx = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  }
  const wd = WEEKDAYS_DE[wdIdx];
  return `${wd} ${String(d).padStart(2, "0")}.${String(mo).padStart(2, "0")}`;
}

/**
 * Datum + Uhrzeit im selben Stil: "Mi 01.06 14:30"
 */
export function formatShortDateTime(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return typeof value === "string" ? value : "";
  const date = formatShortDate(d);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${date} ${hh}:${mm}`;
}