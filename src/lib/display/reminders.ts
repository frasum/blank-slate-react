// DP1: Wiederkehrende Warnbanner fürs Standort-Display.
// Reines Modul — keine DB, keine React-Abhängigkeit. Wird sowohl serverseitig
// (Payload für das öffentliche Display) als auch clientseitig (Fälligkeit
// pünktlich zur Uhrzeit einblenden) genutzt.

export const REMINDER_COLORS = [
  "grau",
  "braun",
  "blau",
  "gruen",
  "gelb",
  "orange",
  "rot",
  "violett",
] as const;
export type ReminderColor = (typeof REMINDER_COLORS)[number];

export type Reminder = {
  id: string;
  title: string;
  emoji: string | null;
  color: ReminderColor;
  /** ISO-Wochentag: 0=Montag … 6=Sonntag. */
  weekday: number;
  intervalWeeks: 1 | 2;
  /** ISO-Datum (YYYY-MM-DD); Pflicht bei intervalWeeks=2. */
  anchorDate: string | null;
  /** "HH:MM" (Berlin-Wandzeit). */
  fromTime: string;
  sortOrder: number;
};

export type NowBerlin = {
  /** Kalenderdatum in Berlin (YYYY-MM-DD). */
  date: string;
  /** Wanduhr-Stunde (0–23) in Berlin. */
  hour: number;
  /** Wanduhr-Minute (0–59) in Berlin. */
  minute: number;
};

function isoDayDiff(a: string, b: string): number {
  const da = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const db = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((da - db) / 86_400_000);
}

/** ISO-Wochentag (0=Mo … 6=So) für ein ISO-Datum. */
export function isoWeekday(iso: string): number {
  // JS: 0=So..6=Sa → ISO 0=Mo..6=So
  const d = new Date(iso + "T00:00:00Z").getUTCDay();
  return (d + 6) % 7;
}

function parseHm(hm: string): number {
  // Akzeptiert "HH:MM" oder "HH:MM:SS".
  const [h, m] = hm.split(":").map((n) => Number(n));
  return h * 60 + (m || 0);
}

/**
 * Weekday+Parität: Reminder ist heute (`businessDate`) grundsätzlich fällig,
 * unabhängig von der Uhrzeit. Serverseitig genutzt, um den Client mit allen
 * heutigen Bannern zu versorgen.
 */
export function remindersForBusinessDate(list: Reminder[], businessDate: string): Reminder[] {
  const wd = isoWeekday(businessDate);
  return list.filter((r) => {
    if (r.weekday !== wd) return false;
    if (r.intervalWeeks === 2) {
      if (!r.anchorDate) return false;
      const diff = isoDayDiff(businessDate, r.anchorDate);
      if (diff % 14 !== 0) return false;
    }
    return true;
  });
}

/**
 * Ist ein einzelner Reminder JETZT aktiv?
 * `businessDate` ist der laufende Geschäftstag (3-Uhr-Cutoff);
 * `nowBerlin` sind die aktuellen Berlin-Wandzeit-Werte.
 *
 * Wichtig: Vergleich als Zeitpunkt, nicht als naive Uhrzeit — nach Mitternacht
 * ist 00:30 des Folgekalendertags immer noch >= 20:00 des Geschäftstags.
 */
export function isReminderActive(
  r: Reminder,
  nowBerlin: NowBerlin,
  businessDate: string,
): boolean {
  if (isoWeekday(businessDate) !== r.weekday) return false;
  if (r.intervalWeeks === 2) {
    if (!r.anchorDate) return false;
    if (isoDayDiff(businessDate, r.anchorDate) % 14 !== 0) return false;
  }
  const dayOffset = isoDayDiff(nowBerlin.date, businessDate);
  if (dayOffset < 0) return false;
  const nowMin = dayOffset * 1440 + nowBerlin.hour * 60 + nowBerlin.minute;
  return nowMin >= parseHm(r.fromTime);
}

/** Nur die aktuell fälligen Reminder — Serverpfad oder Debug-Nutzung. */
export function activeReminders(
  list: Reminder[],
  nowBerlin: NowBerlin,
  businessDate: string,
): Reminder[] {
  return sortReminders(list.filter((r) => isReminderActive(r, nowBerlin, businessDate)));
}

export function sortReminders(list: Reminder[]): Reminder[] {
  return [...list].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.fromTime.localeCompare(b.fromTime),
  );
}

/** Berlin-Wandzeit-Parts aus einem Date (Client-seitig geeignet). */
const BERLIN_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
export function nowBerlinParts(now: Date): NowBerlin {
  const parts = BERLIN_FMT.formatToParts(now);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "0";
  const hourRaw = get("hour");
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: hourRaw === "24" ? 0 : Number(hourRaw),
    minute: Number(get("minute")),
  };
}
