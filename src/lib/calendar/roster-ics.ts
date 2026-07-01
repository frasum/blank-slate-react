// Reine iCalendar-Erzeugung (RFC 5545) für Dienstplan-Abos.
//
// Diese Datei enthält KEIN I/O — nur Formatierung. Der Aufrufer (die
// öffentliche Feed-Route) übergibt bereits aufgelöste Events. Text
// wird nach RFC-5545-Regeln escaped, Zeitpunkte werden in "UTC-Basic"
// (`YYYYMMDDTHHMMSSZ`) geschrieben, Ganztagseinträge nutzen
// `DTSTART;VALUE=DATE`. Line-Endings sind `\r\n`.

export type RosterIcsEvent =
  | {
      uid: string;
      summary: string;
      location: string;
      allDay: true;
      date: string; // YYYY-MM-DD
    }
  | {
      uid: string;
      summary: string;
      location: string;
      allDay: false;
      startIso: string; // ISO-8601 UTC
      endIso: string;
    };

export type BuildRosterIcsInput = {
  calendarName: string;
  events: RosterIcsEvent[];
  now?: Date; // Testbarkeit für DTSTAMP
};

// Escape für TEXT-Werte (SUMMARY, LOCATION, DESCRIPTION).
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

// "YYYYMMDDTHHMMSSZ" aus ISO-8601 (UTC).
export function utcBasicFromIso(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function dateBasic(isoDate: string): string {
  return isoDate.replace(/-/g, "");
}

export function buildRosterIcs(input: BuildRosterIcsInput): string {
  const now = input.now ?? new Date();
  const dtstamp = utcBasicFromIso(now.toISOString());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//COCO//Dienstplan//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(input.calendarName)}`,
  ];
  for (const ev of input.events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${ev.uid}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    if (ev.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${dateBasic(ev.date)}`);
    } else {
      lines.push(`DTSTART:${utcBasicFromIso(ev.startIso)}`);
      lines.push(`DTEND:${utcBasicFromIso(ev.endIso)}`);
    }
    lines.push(`SUMMARY:${escapeIcsText(ev.summary)}`);
    lines.push(`LOCATION:${escapeIcsText(ev.location)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
