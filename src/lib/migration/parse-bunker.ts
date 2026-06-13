// Parser für CSV-Exporte aus bunker/zt_shifts.
// Header sind verbindlich; Abweichung => harter Fehler mit präziser Meldung.

import { assertHeaders, parseCsv } from "./csv";
import { combineDateAndTimes, type NormalizedShift } from "./normalize";

export const BUNKER_HEADERS = [
  "id",
  "staff_id",
  "staff_name",
  "restaurant_id",
  "shift_date",
  "source",
  "start_time",
  "end_time",
  "clocked_in_at",
  "clocked_out_at",
  "break_minutes",
  "absence_type",
  "total_hours",
  "notes",
] as const;

function intOrZero(v: string | null): number {
  if (v === null) return 0;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

function numOrZero(v: string | null): number {
  if (v === null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const ISO_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

export function parseBunkerCsv(csvText: string): NormalizedShift[] {
  const { headers, rows } = parseCsv(csvText);
  assertHeaders(headers, BUNKER_HEADERS, "bunker/zt_shifts");

  const out: NormalizedShift[] = [];
  for (const r of rows) {
    const altId = (r.id ?? "").trim();
    const altEmployeeId = (r.staff_id ?? "").trim();
    const altEmployeeName = (r.staff_name ?? "").trim();
    const shiftDate = (r.shift_date ?? "").trim();
    const breakMinutes = intOrZero(r.break_minutes);

    const base = {
      altSystem: "bunker" as const,
      altId,
      altEmployeeId,
      altEmployeeName,
      shiftDate,
      breakMinutes,
      isHoliday: false,
      // Bunker liefert kein SFN-Topf-Set; nur total_hours für rudimentären Abgleich.
      altTotals: {
        totalHours: numOrZero(r.total_hours),
        eveningHours: 0,
        nightHours: 0,
        nightDeepHours: 0,
        sundayHolidayHours: 0,
      },
    };

    // Abwesenheit
    if (r.absence_type !== null) {
      out.push({ ...base, startedAt: null, endedAt: null, skipReason: "absence" });
      continue;
    }

    // Bevorzugt start_time/end_time (mit shift_date kombinieren), sonst clocked_*.
    if (r.start_time !== null && r.end_time !== null) {
      const combined = combineDateAndTimes(shiftDate, r.start_time, r.end_time);
      if (!combined) {
        out.push({ ...base, startedAt: null, endedAt: null, skipReason: "invalid_time" });
        continue;
      }
      out.push({
        ...base,
        startedAt: combined.startedAt,
        endedAt: combined.endedAt,
        skipReason: null,
      });
      continue;
    }
    if (r.clocked_in_at !== null && r.clocked_out_at !== null) {
      if (!ISO_TS.test(r.clocked_in_at) || !ISO_TS.test(r.clocked_out_at)) {
        out.push({ ...base, startedAt: null, endedAt: null, skipReason: "invalid_time" });
        continue;
      }
      const a = new Date(r.clocked_in_at);
      const b = new Date(r.clocked_out_at);
      if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b.getTime() <= a.getTime()) {
        out.push({ ...base, startedAt: null, endedAt: null, skipReason: "invalid_time" });
        continue;
      }
      out.push({ ...base, startedAt: a.toISOString(), endedAt: b.toISOString(), skipReason: null });
      continue;
    }
    // Weder Plan- noch Stempelzeit => keine Schicht.
    out.push({ ...base, startedAt: null, endedAt: null, skipReason: "absence" });
  }
  return out;
}
