// B6b — Zuschlagsberechnung (reines Modul, 1:1 nach Altsystem).
//
// Regeln:
//   * Abendstunden  = Überlappung der Schicht mit [businessDate 20:00, 24:00] Europe/Berlin
//   * Nachtstunden  = Minuten nach Mitternacht (nur wenn Schicht Mitternacht überschreitet)
//   * So/Fei        = gesamte Schichtstunden, wenn businessDate Sonntag oder bayerischer Feiertag
//   * Effektiv:     Abend/Nacht werden auf 0 gesetzt, sobald So/Fei > 0 (höherer Zuschlag überschreibt)
//
// Bayerische Feiertage: fest kodiert + bewegliche aus Ostersonntag (Gauß).

export type ShiftHourResult = {
  totalHours: number;
  eveningHours: number;
  nightHours: number;
  sundayHolidayHours: number;
};

function parseIsoDateUTC(iso: string): Date {
  // YYYY-MM-DD → 12:00:00 UTC (sicher gegen DST-Rundungen)
  return new Date(`${iso}T12:00:00Z`);
}

function easterSunday(year: number): Date {
  // Gaußsche Osterformel (gregorianisch).
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addUTCDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function fmtMmDd(d: Date): string {
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function bavarianHolidayMap(year: number): Map<string, string> {
  const easter = easterSunday(year);
  const map = new Map<string, string>();
  map.set("01-01", "Neujahr");
  map.set("01-06", "Heilige Drei Könige");
  map.set(fmtMmDd(addUTCDays(easter, -2)), "Karfreitag");
  map.set(fmtMmDd(addUTCDays(easter, 1)), "Ostermontag");
  map.set("05-01", "Tag der Arbeit");
  map.set(fmtMmDd(addUTCDays(easter, 39)), "Christi Himmelfahrt");
  map.set(fmtMmDd(addUTCDays(easter, 50)), "Pfingstmontag");
  map.set(fmtMmDd(addUTCDays(easter, 60)), "Fronleichnam");
  map.set("08-15", "Mariä Himmelfahrt");
  map.set("10-03", "Tag der deutschen Einheit");
  map.set("11-01", "Allerheiligen");
  map.set("12-24", "Heiligabend");
  map.set("12-25", "1. Weihnachtstag");
  map.set("12-26", "2. Weihnachtstag");
  return map;
}

export function isBavarianHoliday(date: Date): boolean {
  const year = date.getUTCFullYear();
  return bavarianHolidayMap(year).has(fmtMmDd(date));
}

export function bavarianHolidayName(date: Date): string | null {
  const year = date.getUTCFullYear();
  return bavarianHolidayMap(year).get(fmtMmDd(date)) ?? null;
}

export function isSundayOrHoliday(date: Date): boolean {
  // getUTCDay: 0 = Sunday
  if (date.getUTCDay() === 0) return true;
  return isBavarianHoliday(date);
}

function berlinOffsetMinutes(dateIso: string): number {
  // Bestimmt den Europe/Berlin-Offset (in Minuten) zum Mittag des angegebenen Tages.
  const ref = new Date(`${dateIso}T12:00:00Z`);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(ref);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - ref.getTime()) / 60000);
}

function offsetString(minutes: number): string {
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

function overlapMs(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

export function computeShiftHours(
  startedAt: string,
  endedAt: string,
  businessDate: string,
): ShiftHourResult {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  const totalHours = Math.max(0, (end - start) / 3_600_000);

  // Lokale 20:00 und 24:00 (Mitternacht) des businessDate in Europe/Berlin.
  const businessDay = parseIsoDateUTC(businessDate);
  const nextIso = (() => {
    const n = addUTCDays(businessDay, 1);
    return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, "0")}-${String(n.getUTCDate()).padStart(2, "0")}`;
  })();
  const off = offsetString(berlinOffsetMinutes(businessDate));
  const offNext = offsetString(berlinOffsetMinutes(nextIso));
  const eveningStartMs = new Date(`${businessDate}T20:00:00${off}`).getTime();
  const midnightMs = new Date(`${nextIso}T00:00:00${offNext}`).getTime();
  // Endpunkt für Nachtfenster: bis 24h nach Mitternacht ist mehr als genug.
  const nightEndCapMs = midnightMs + 24 * 3_600_000;

  const eveningHours = overlapMs(start, end, eveningStartMs, midnightMs) / 3_600_000;
  const nightHours =
    end > midnightMs ? overlapMs(start, end, midnightMs, nightEndCapMs) / 3_600_000 : 0;

  const sundayHoliday = isSundayOrHoliday(businessDay);
  const sundayHolidayHours = sundayHoliday ? totalHours : 0;

  return {
    totalHours,
    eveningHours: sundayHoliday ? 0 : eveningHours,
    nightHours: sundayHoliday ? 0 : nightHours,
    sundayHolidayHours,
  };
}
