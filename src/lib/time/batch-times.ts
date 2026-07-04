// BZ1 — Batch-Werkzeug „Schichtzeiten anpassen" (reines Modul, keine I/O).
//
// Portierung aus der Legacy-tagesabrechnung (ShiftTimeOverride). Entscheidet
// pro (Mitarbeiter, Tag), was zu tun ist. Kennt drei Modi:
//
//   * override           — nur bestehende eigene Schicht(en) am Standort überschreiben
//   * create_weekdays    — Mo–Fr erzeugen bzw. überschreiben (Werk-Feiertage bekommen sunhol-Zeiten)
//   * create_daily       — Mo–So erzeugen bzw. überschreiben
//
// Standardzeiten sind konfigurierbar (organization_settings). Legacy-Defaults
// bleiben 17:00–01:00 (werktags) und 15:00–02:00 (Sonntag/Feiertag) — beim
// Mitternachts-Wrap landet der End-Zeitpunkt am Folgetag.
//
// Pausen: ArbZG-Empfehlung (0/30/45 min) über `arbzgMinimumBreak`.

import { arbzgMinimumBreak } from "./break-rules";
import { berlinOffsetMinutes, isBavarianHoliday, offsetString } from "./shift-hours";

export type BatchMode = "override" | "create_weekdays" | "create_daily";

export type BatchSettings = {
  weekdayStart: string; // "HH:MM"
  weekdayEnd: string;
  sunholStart: string;
  sunholEnd: string;
};

export type BatchSkipReason = "locked" | "absence" | "other-location" | "no-entry" | "not-weekday";

export type BatchDayInput = {
  dateIso: string;
  mode: BatchMode;
  isLocked: boolean;
  hasAbsence: boolean;
  ownEntry?: { id: string; hasTimes: boolean };
  otherLocationEntry: boolean;
};

export type BatchDayResult =
  | { action: "skip"; reason: BatchSkipReason }
  | { action: "update"; entryId: string }
  | { action: "create" };

function parseIsoDateUTC(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

function addUTCDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function nextIsoDate(iso: string): string {
  const n = addUTCDays(parseIsoDateUTC(iso), 1);
  return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, "0")}-${String(
    n.getUTCDate(),
  ).padStart(2, "0")}`;
}

function isWeekday(dateIso: string): boolean {
  // Mo–Fr
  const d = parseIsoDateUTC(dateIso);
  const dow = d.getUTCDay();
  return dow >= 1 && dow <= 5;
}

function isSundayIso(dateIso: string): boolean {
  return parseIsoDateUTC(dateIso).getUTCDay() === 0;
}

export function standardTimesFor(
  dateIso: string,
  settings: BatchSettings,
): { start: string; end: string } {
  const d = parseIsoDateUTC(dateIso);
  if (isSundayIso(dateIso) || isBavarianHoliday(d)) {
    return { start: settings.sunholStart, end: settings.sunholEnd };
  }
  return { start: settings.weekdayStart, end: settings.weekdayEnd };
}

export function resolveBatchDay(input: BatchDayInput): BatchDayResult {
  if (input.isLocked) return { action: "skip", reason: "locked" };
  if (input.hasAbsence) return { action: "skip", reason: "absence" };

  if (input.mode === "override") {
    if (input.ownEntry && input.ownEntry.hasTimes) {
      return { action: "update", entryId: input.ownEntry.id };
    }
    return { action: "skip", reason: "no-entry" };
  }

  if (input.mode === "create_weekdays" && !isWeekday(input.dateIso)) {
    return { action: "skip", reason: "not-weekday" };
  }

  // create_weekdays / create_daily
  if (input.otherLocationEntry) return { action: "skip", reason: "other-location" };
  if (input.ownEntry) return { action: "update", entryId: input.ownEntry.id };
  return { action: "create" };
}

function toHm(hm: string): { h: number; m: number } {
  const [h, m] = hm.split(":");
  return { h: Number(h), m: Number(m ?? "0") };
}

/**
 * Baut Start/End ISO-Timestamps (Europe/Berlin, DST-fest via
 * `berlinOffsetMinutes` je Tag) sowie die ArbZG-Empfehlung für die Pause.
 * Wenn end ≤ start, landet end am Folgetag (Mitternachts-Wrap).
 */
export function batchTimestamps(
  dateIso: string,
  start: string,
  end: string,
): { startedAtIso: string; endedAtIso: string; breakMinutes: number } {
  const s = toHm(start);
  const e = toHm(end);
  const startMinutes = s.h * 60 + s.m;
  const endMinutes = e.h * 60 + e.m;
  const wraps = endMinutes <= startMinutes;
  const endDateIso = wraps ? nextIsoDate(dateIso) : dateIso;

  const offStart = offsetString(berlinOffsetMinutes(dateIso));
  const offEnd = offsetString(berlinOffsetMinutes(endDateIso));
  const startedAtIso = new Date(
    `${dateIso}T${String(s.h).padStart(2, "0")}:${String(s.m).padStart(2, "0")}:00${offStart}`,
  ).toISOString();
  const endedAtIso = new Date(
    `${endDateIso}T${String(e.h).padStart(2, "0")}:${String(e.m).padStart(2, "0")}:00${offEnd}`,
  ).toISOString();

  const grossMinutes = Math.round(
    (new Date(endedAtIso).getTime() - new Date(startedAtIso).getTime()) / 60000,
  );
  return {
    startedAtIso,
    endedAtIso,
    breakMinutes: arbzgMinimumBreak(grossMinutes),
  };
}
