// Gemeinsames Schema für CSV-importierte Alt-Schichten und Hilfsfunktionen
// zur Übersetzung lokaler Berlin-Wandzeit in UTC-ISO.

export type SourceSystem = "tagesabrechnung" | "bunker";

export type SkipReason =
  | "absence"
  | "invalid_time"
  | "unmapped_staff"
  | "duplicate";

export type AltTotals = {
  totalHours: number;
  eveningHours: number;
  nightHours: number;
  nightDeepHours: number;
  sundayHolidayHours: number;
};

export type NormalizedShift = {
  altSystem: SourceSystem;
  altId: string;
  altEmployeeId: string;
  altEmployeeName: string;
  shiftDate: string; // YYYY-MM-DD (= business_date direkt übernommen)
  startedAt: string | null; // ISO timestamptz; null bei Skip
  endedAt: string | null;
  breakMinutes: number;
  altTotals: AltTotals | null;
  skipReason: SkipReason | null;
};

const BERLIN_TZ = "Europe/Berlin";

/**
 * Wandelt eine Wandzeit (YYYY-MM-DD HH:MM:SS) in Europe/Berlin in UTC-ISO um.
 * Iteratives Fixpunkt-Verfahren — DST-sicher.
 */
export function berlinWallClockToUTC(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): string {
  const target = Date.UTC(year, month - 1, day, hour, minute, second);
  let ts = target;
  for (let i = 0; i < 3; i++) {
    const wall = formatAsUtcInZone(ts);
    const delta = wall - target;
    if (delta === 0) break;
    ts -= delta;
  }
  return new Date(ts).toISOString();
}

function formatAsUtcInZone(ts: number): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BERLIN_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ts));
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  return Date.UTC(
    Number(m.year),
    Number(m.month) - 1,
    Number(m.day),
    Number(m.hour === "24" ? "00" : m.hour),
    Number(m.minute),
    Number(m.second),
  );
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_TIME = /^(\d{2}):(\d{2}):(\d{2})$/;

/**
 * Kombiniert shift_date + HH:MM:SS zu ISO-UTC. Falls endTime <= startTime,
 * wird endTime auf den Folgetag gesetzt (Übernacht-Schicht).
 * Gibt null zurück, wenn Format ungültig.
 */
export function combineDateAndTimes(
  shiftDate: string,
  startTime: string,
  endTime: string,
): { startedAt: string; endedAt: string } | null {
  const dm = ISO_DATE.exec(shiftDate);
  const sm = ISO_TIME.exec(startTime);
  const em = ISO_TIME.exec(endTime);
  if (!dm || !sm || !em) return null;
  const y = Number(dm[1]);
  const mo = Number(dm[2]);
  const d = Number(dm[3]);
  const sh = Number(sm[1]);
  const smin = Number(sm[2]);
  const ssec = Number(sm[3]);
  const eh = Number(em[1]);
  const emin = Number(em[2]);
  const esec = Number(em[3]);
  if (sh > 23 || smin > 59 || ssec > 59) return null;
  if (eh > 23 || emin > 59 || esec > 59) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const startedAt = berlinWallClockToUTC(y, mo, d, sh, smin, ssec);
  const startTotal = sh * 3600 + smin * 60 + ssec;
  const endTotal = eh * 3600 + emin * 60 + esec;
  let endY = y;
  let endMo = mo;
  let endD = d;
  if (endTotal <= startTotal) {
    // Folgetag.
    const next = new Date(Date.UTC(y, mo - 1, d) + 86_400_000);
    endY = next.getUTCFullYear();
    endMo = next.getUTCMonth() + 1;
    endD = next.getUTCDate();
  }
  const endedAt = berlinWallClockToUTC(endY, endMo, endD, eh, emin, esec);
  return { startedAt, endedAt };
}

/** "HH:MM:SS" → "HH:MM" für den tagesabrechnung-Adapter. */
export function trimSecondsHHMM(value: string): string {
  const m = ISO_TIME.exec(value);
  if (!m) return value;
  return `${m[1]}:${m[2]}`;
}