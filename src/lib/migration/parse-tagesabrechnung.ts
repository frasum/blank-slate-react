// Parser für CSV-Exporte aus tagesabrechnung/zt_shifts.
// Header sind verbindlich; Abweichung => harter Fehler mit präziser Meldung.

import { assertHeaders, parseCsv } from "./csv";
import { combineDateAndTimes, type AltTotals, type NormalizedShift } from "./normalize";

export const TAGESABRECHNUNG_HEADERS = [
  "id",
  "employee_id",
  "staff_name",
  "staff_nickname",
  "shift_date",
  "department",
  "start_time",
  "end_time",
  "absence_type",
  "is_holiday",
  "total_hours",
  "evening_hours",
  "night_hours",
  "night_deep_hours",
  "sunday_holiday_hours",
] as const;

function numOrZero(v: string | null): number {
  if (v === null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function parseTagesabrechnungCsv(csvText: string): NormalizedShift[] {
  const { headers, rows } = parseCsv(csvText);
  assertHeaders(headers, TAGESABRECHNUNG_HEADERS, "tagesabrechnung/zt_shifts");

  const out: NormalizedShift[] = [];
  for (const r of rows) {
    const altId = (r.id ?? "").trim();
    const altEmployeeId = (r.employee_id ?? "").trim();
    const altEmployeeName = (r.staff_name ?? r.staff_nickname ?? "").trim();
    const shiftDate = (r.shift_date ?? "").trim();

    const totals: AltTotals = {
      totalHours: numOrZero(r.total_hours),
      eveningHours: numOrZero(r.evening_hours),
      nightHours: numOrZero(r.night_hours),
      nightDeepHours: numOrZero(r.night_deep_hours),
      sundayHolidayHours: numOrZero(r.sunday_holiday_hours),
    };

    const base = {
      altSystem: "tagesabrechnung" as const,
      altId,
      altEmployeeId,
      altEmployeeName,
      shiftDate,
      breakMinutes: 0, // existiert in dieser Quelle nicht
      altTotals: totals,
      isHoliday: (r.is_holiday ?? "").toLowerCase() === "true",
    };

    // Abwesenheit ausschließlich, wenn absence_type gesetzt ist (urlaub/krank/…).
    if (r.absence_type !== null) {
      out.push({
        ...base,
        startedAt: null,
        endedAt: null,
        skipReason: "absence",
      });
      continue;
    }

    // Fehlende oder ungültige Zeiten ohne Abwesenheit → invalid_time.
    const combined =
      r.start_time !== null && r.end_time !== null
        ? combineDateAndTimes(shiftDate, r.start_time, r.end_time)
        : null;
    if (!combined) {
      out.push({
        ...base,
        startedAt: null,
        endedAt: null,
        skipReason: "invalid_time",
      });
      continue;
    }

    out.push({
      ...base,
      startedAt: combined.startedAt,
      endedAt: combined.endedAt,
      skipReason: null,
    });
  }
  return out;
}
