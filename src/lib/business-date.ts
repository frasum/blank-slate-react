/**
 * Geschäftstag-Berechnung (Europe/Berlin, 3-Uhr-Cutoff).
 *
 * Eine Schicht, die vor 03:00 Uhr Ortszeit endet, gehört noch zum
 * Vortag. Die SQL-Variante lebt in der Migration
 *   supabase/migrations/20260612120000_b0_organizations_locations.sql
 * als public.current_business_date(). TS- und SQL-Version MÜSSEN
 * semantisch synchron bleiben — Änderungen hier ohne Migration und
 * umgekehrt sind ein Bug.
 *
 * DST-Sicherheit: Wir verlassen uns auf Intl.DateTimeFormat mit
 * timeZone 'Europe/Berlin' statt auf naive Stunden-Arithmetik auf UTC.
 */

const BERLIN = "Europe/Berlin";

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BERLIN,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function berlinParts(date: Date): { year: number; month: number; day: number; hour: number } {
  const parts = partsFormatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string => {
    const part = parts.find((p) => p.type === type);
    if (!part) throw new Error(`Missing date part: ${type}`);
    return part.value;
  };
  // en-CA liefert die Stunde "24" für Mitternacht — auf "00" normalisieren.
  const hourRaw = get("hour");
  const hour = hourRaw === "24" ? 0 : Number(hourRaw);
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour,
  };
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Liefert den Geschäftstag als ISO-Datum (YYYY-MM-DD) in Europe/Berlin.
 * Für Zeitpunkte zwischen 00:00 und 02:59:59.999 wird der Vortag
 * zurückgegeben.
 */
export function businessDateOf(date: Date): string {
  const { year, month, day, hour } = berlinParts(date);
  // Mittag UTC vermeidet DST-Sprünge bei der Tages-Arithmetik.
  const noon = Date.UTC(year, month - 1, day, 12, 0, 0);
  const shifted = hour < 3 ? new Date(noon - 24 * 60 * 60 * 1000) : new Date(noon);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}
