// Konsolidierte Ableitungen für Reconcile/Import:
//   - localTimes: HH:MM in Berlin-Wandzeit aus started_at/ended_at (Intl mit
//     timeZone Europe/Berlin — KEINE getHours()/UTC-Ableitung, weil sonst die
//     SFN-Zuschlagsfenster im Sommer/Winter um 1–2 h verschoben wären).
//   - sundayHoliday: shiftDate ist Sonntag ODER altTagesabrechnung-Flag.
//   - importKey: `<altSystem>:<altId>` (Idempotenzschlüssel; siehe partial unique
//     index `(organization_id, import_key) WHERE source='import'`).

import type { NormalizedShift } from "./normalize";
import { isSundayDate, utcIsoToBerlinHHMM } from "./normalize";

export function localTimesOf(s: NormalizedShift): { startLocal: string; endLocal: string } | null {
  if (!s.startedAt || !s.endedAt) return null;
  return {
    startLocal: utcIsoToBerlinHHMM(s.startedAt),
    endLocal: utcIsoToBerlinHHMM(s.endedAt),
  };
}

export function sundayHolidayOf(s: NormalizedShift): boolean {
  return s.isHoliday || isSundayDate(s.shiftDate);
}

export function importKeyOf(s: NormalizedShift): string {
  return `${s.altSystem}:${s.altId}`;
}