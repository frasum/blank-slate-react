/**
 * Brücke `time_entries` → `SfnShiftRow` (2a-Geld-Modul).
 *
 * - Uhrzeit in Europa/Berlin lokalisieren (Original-Logik rechnet in lokalen
 *   "HH:MM"-Strings).
 * - Pause proportional auf alle Töpfe verteilen.
 * - Feiertags-Flags aus `shift-hours.ts` (Bayern).
 */

import { calculateShiftHours } from "@/lib/time/sfn/tagesabrechnung";
import { isBavarianHoliday, isSundayOrHoliday } from "@/lib/time/shift-hours";
import type { SfnShiftRow } from "@/lib/lohn/sfn-geld/types";

export interface SfnRawHours {
  totalHours: number;
  eveningHours: number;
  nightHours: number;
  nightDeepHours: number;
  sundayHolidayHours: number;
}

export interface ClosedTimeEntry {
  startedAt: string;
  endedAt: string;
  /** "YYYY-MM-DD" */
  businessDate: string;
  breakMinutes: number;
}

function berlinHHMM(iso: string): string {
  const parts = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const h = parts.find((p) => p.type === "hour")!.value;
  const m = parts.find((p) => p.type === "minute")!.value;
  return `${h}:${m}`;
}

/**
 * Pause proportional kürzen. Faktor = max(0, (total - pause) / total).
 * Alle Töpfe werden mit demselben Faktor skaliert; totalHours selbst wird
 * direkt um die Pausenstunden gekürzt (an 0 gekappt).
 */
export function applyBreakProration(raw: SfnRawHours, breakMinutes: number): SfnRawHours {
  const breakH = Math.max(0, breakMinutes) / 60;
  if (raw.totalHours <= 0) {
    return {
      totalHours: 0,
      eveningHours: 0,
      nightHours: 0,
      nightDeepHours: 0,
      sundayHolidayHours: 0,
    };
  }
  const f = Math.max(0, (raw.totalHours - breakH) / raw.totalHours);
  return {
    totalHours: Math.max(0, raw.totalHours - breakH),
    eveningHours: raw.eveningHours * f,
    nightHours: raw.nightHours * f,
    nightDeepHours: raw.nightDeepHours * f,
    sundayHolidayHours: raw.sundayHolidayHours * f,
  };
}

export function timeEntryToSfnRow(e: ClosedTimeEntry): SfnShiftRow {
  const businessDay = new Date(`${e.businessDate}T12:00:00Z`);
  const sundayOrHoliday = isSundayOrHoliday(businessDay);
  const raw = calculateShiftHours({
    start: berlinHHMM(e.startedAt),
    end: berlinHHMM(e.endedAt),
    sundayOrHoliday,
  });
  const prorated = applyBreakProration(raw, e.breakMinutes);
  return {
    totalHours: prorated.totalHours,
    eveningHours: prorated.eveningHours,
    nightHours: prorated.nightHours,
    nightDeepHours: prorated.nightDeepHours,
    sundayHolidayHours: prorated.sundayHolidayHours,
    isHoliday: isBavarianHoliday(businessDay),
    shiftDate: e.businessDate,
  };
}
