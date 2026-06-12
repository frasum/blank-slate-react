/**
 * Adapter "bunker" — Portierung von `computeSfn` aus
 * bunker-shift-flow/.../sfn.ts. ZWEITE TESTQUELLE für B2-SFN.
 *
 * Unterschiede zur tagesabrechnung-Referenz:
 *   - parametrisiert (night_start/end, sunday_pct, holiday_pct, night_pct)
 *   - Sonntag und Feiertag werden GETRENNT geführt; Feiertag schlägt Sonntag
 *   - Pause wird proportional über grossMin verteilt (Faktor 1 − brk/grossMin)
 *   - liefert zusätzlich Geld-Felder (surchargePct, surchargeWage) —
 *     gehören streng genommen nach M4, werden hier 1:1 mitgezogen,
 *     damit die Original-Testfälle bitgenau reproduzierbar bleiben.
 *
 * KEIN DB-Zugriff, KEINE Tagesaggregation.
 */

export type SfnSettings = {
  night_start: string; // "HH:MM[:SS]"
  night_end: string;
  sunday_pct: number;
  holiday_pct: number;
  night_pct: number;
  enabled: boolean;
};

export type SfnBreakdown = {
  workedHours: number;
  sundayHours: number;
  holidayHours: number;
  nightHours: number;
  surchargePct: number;
  surchargeWage: number;
};

const tToMin = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};

const overlap = (aS: number, aE: number, bS: number, bE: number): number =>
  Math.max(0, Math.min(aE, bE) - Math.max(aS, bS));

const toISODateLocal = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export function computeSfn(args: {
  shiftDate: string;
  startTime: string | null;
  endTime: string | null;
  breakMinutes: number;
  totalHours: number;
  hourlyRate: number;
  settings: SfnSettings;
  holidays: Set<string>;
}): SfnBreakdown {
  const empty: SfnBreakdown = {
    workedHours: args.totalHours || 0,
    sundayHours: 0,
    holidayHours: 0,
    nightHours: 0,
    surchargePct: 0,
    surchargeWage: 0,
  };
  if (!args.settings.enabled) return empty;
  if (!args.startTime || !args.endTime) return empty;

  const startMin = tToMin(args.startTime);
  let endMin = tToMin(args.endTime);
  if (endMin <= startMin) endMin += 24 * 60;
  const grossMin = endMin - startMin;
  if (grossMin <= 0) return empty;

  const seg1 = { s: startMin, e: Math.min(1440, endMin) };
  const seg2 = endMin > 1440 ? { s: 1440, e: endMin } : null;

  const isSunday = (iso: string) => new Date(iso + "T00:00:00").getDay() === 0;
  const isHoliday = (iso: string) => args.holidays.has(iso);

  const nextDate = (iso: string) => {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + 1);
    return toISODateLocal(d);
  };

  const nS = tToMin(args.settings.night_start);
  const nE = tToMin(args.settings.night_end);
  const nightWindows: Array<[number, number]> = [];
  if (nE > nS) {
    nightWindows.push([nS, nE]);
    nightWindows.push([1440 + nS, 1440 + nE]);
  } else {
    nightWindows.push([nS, 1440]);
    nightWindows.push([0, nE]);
    nightWindows.push([1440 + nS, 2880]);
    nightWindows.push([1440, 1440 + nE]);
  }

  let nightMin = 0;
  for (const [ws, we] of nightWindows) {
    nightMin += overlap(startMin, endMin, ws, we);
  }

  let sundayMin = 0;
  let holidayMin = 0;

  const addCategory = (segS: number, segE: number, dateIso: string) => {
    const minutes = Math.max(0, segE - segS);
    if (minutes <= 0) return;
    if (isHoliday(dateIso)) holidayMin += minutes;
    else if (isSunday(dateIso)) sundayMin += minutes;
  };

  addCategory(seg1.s, seg1.e, args.shiftDate);
  if (seg2) addCategory(seg2.s, seg2.e, nextDate(args.shiftDate));

  const brk = Math.max(0, args.breakMinutes || 0);
  const factor = grossMin > 0 ? Math.max(0, 1 - brk / grossMin) : 1;

  const sundayHours = (sundayMin / 60) * factor;
  const holidayHours = (holidayMin / 60) * factor;
  const nightHours = (nightMin / 60) * factor;
  const workedHours = args.totalHours || (grossMin - brk) / 60;

  const baseRate = args.hourlyRate || 0;
  const surchargeWage =
    ((sundayHours * args.settings.sunday_pct +
      holidayHours * args.settings.holiday_pct +
      nightHours * args.settings.night_pct) *
      baseRate) /
    100;

  const surchargePct =
    workedHours > 0 ? (surchargeWage / (workedHours * baseRate || 1)) * 100 : 0;

  return {
    workedHours,
    sundayHours,
    holidayHours,
    nightHours,
    surchargePct,
    surchargeWage,
  };
}

export const DEFAULT_SFN: SfnSettings = {
  night_start: "20:00",
  night_end: "06:00",
  sunday_pct: 50,
  holiday_pct: 125,
  night_pct: 25,
  enabled: true,
};