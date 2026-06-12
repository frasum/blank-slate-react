// Abgleichsbericht: Alt-Topf-Summen (aus CSV) vs. neu via tagesabrechnung-Adapter
// gerechnete Werte. Erwartung: 0 Differenzen — jede Differenz ist ein Datenbefund.

import { aggregate, cycleKey, isoWeekKey, type ShiftSample } from "./aggregate-by-business-date";
import type { AltTotals, NormalizedShift } from "./normalize";

export type ReconcileGroupBy = "week" | "cycle";

export type ReconcileRow = {
  staffId: string;
  bucketKey: string;
  alt: AltTotals;
  recomputed: AltTotals;
  diff: AltTotals;
  hasDifference: boolean;
};

const EMPTY_TOTALS: AltTotals = {
  totalHours: 0,
  eveningHours: 0,
  nightHours: 0,
  nightDeepHours: 0,
  sundayHolidayHours: 0,
};

function addTotals(a: AltTotals, b: AltTotals): AltTotals {
  return {
    totalHours: round2(a.totalHours + b.totalHours),
    eveningHours: round2(a.eveningHours + b.eveningHours),
    nightHours: round2(a.nightHours + b.nightHours),
    nightDeepHours: round2(a.nightDeepHours + b.nightDeepHours),
    sundayHolidayHours: round2(a.sundayHolidayHours + b.sundayHolidayHours),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function diffOf(a: AltTotals, b: AltTotals): AltTotals {
  return {
    totalHours: round2(a.totalHours - b.totalHours),
    eveningHours: round2(a.eveningHours - b.eveningHours),
    nightHours: round2(a.nightHours - b.nightHours),
    nightDeepHours: round2(a.nightDeepHours - b.nightDeepHours),
    sundayHolidayHours: round2(a.sundayHolidayHours - b.sundayHolidayHours),
  };
}

function hasAnyDiff(d: AltTotals): boolean {
  return (
    d.totalHours !== 0 ||
    d.eveningHours !== 0 ||
    d.nightHours !== 0 ||
    d.nightDeepHours !== 0 ||
    d.sundayHolidayHours !== 0
  );
}

/**
 * @param shifts importierte Alt-Zeilen (übersprungene Skip-Zeilen vorher ausfiltern).
 * @param staffIdOf Auflösung Alt-Mitarbeiter → unsere staff_id (über bestätigtes Mapping).
 * @param sundayHolidayOf Flag pro Schicht (CSV-`is_holiday` ODER businessDate ist Sonntag).
 * @param localTimes liefert HH:MM(:SS) Start/Ende in Berlin-Wandzeit. Bei Bunker ohne
 *        start_time/end_time kann der Caller aus clocked_*-Zeiten zurückrechnen.
 */
export function reconcile(params: {
  shifts: NormalizedShift[];
  staffIdOf: (s: NormalizedShift) => string | null;
  sundayHolidayOf: (s: NormalizedShift) => boolean;
  localTimes: (s: NormalizedShift) => { startLocal: string; endLocal: string } | null;
  groupBy: ReconcileGroupBy;
}): ReconcileRow[] {
  const { shifts, staffIdOf, sundayHolidayOf, localTimes, groupBy } = params;
  const bucketOf = groupBy === "cycle" ? cycleKey : isoWeekKey;

  // 1) Alt-Summen aus CSV
  const altMap = new Map<string, { staffId: string; bucketKey: string; sum: AltTotals }>();
  // 2) Sample für Neu-Rechnung
  const samples: ShiftSample[] = [];

  for (const s of shifts) {
    if (s.skipReason !== null) continue;
    const staffId = staffIdOf(s);
    if (!staffId) continue;
    const bucket = bucketOf(s.shiftDate);
    const key = `${staffId}::${bucket}`;
    const alt = s.altTotals ?? EMPTY_TOTALS;
    const ex = altMap.get(key);
    altMap.set(key, {
      staffId,
      bucketKey: bucket,
      sum: ex ? addTotals(ex.sum, alt) : { ...alt },
    });
    const times = localTimes(s);
    if (times) {
      samples.push({
        staffId,
        businessDate: s.shiftDate,
        startLocal: times.startLocal,
        endLocal: times.endLocal,
        sundayOrHoliday: sundayHolidayOf(s),
      });
    }
  }

  const recomputedBuckets = aggregate(samples, (s) => bucketOf(s.businessDate));
  const recoMap = new Map<string, AltTotals>();
  for (const b of recomputedBuckets) {
    recoMap.set(`${b.staffId}::${b.bucketKey}`, {
      totalHours: b.totalHours,
      eveningHours: b.eveningHours,
      nightHours: b.nightHours,
      nightDeepHours: b.nightDeepHours,
      sundayHolidayHours: b.sundayHolidayHours,
    });
  }

  const out: ReconcileRow[] = [];
  const keys = new Set<string>([...altMap.keys(), ...recoMap.keys()]);
  for (const key of keys) {
    const altEntry = altMap.get(key);
    const reco = recoMap.get(key) ?? { ...EMPTY_TOTALS };
    const staffId = altEntry?.staffId ?? key.split("::")[0];
    const bucketKey = altEntry?.bucketKey ?? key.split("::")[1];
    const alt = altEntry?.sum ?? { ...EMPTY_TOTALS };
    const diff = diffOf(alt, reco);
    out.push({
      staffId,
      bucketKey,
      alt,
      recomputed: reco,
      diff,
      hasDifference: hasAnyDiff(diff),
    });
  }
  return out.sort((a, b) =>
    a.staffId === b.staffId ? a.bucketKey.localeCompare(b.bucketKey) : a.staffId.localeCompare(b.staffId),
  );
}