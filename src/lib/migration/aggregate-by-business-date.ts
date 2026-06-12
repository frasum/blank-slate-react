// Tagesaggregation gemäß dokumentierter Regel:
// Jeder time_entry wird einzeln durch den tagesabrechnung-Adapter gerechnet,
// Tages-/Wochensummen sind die Summe der Topf-Werte über die Einträge.
// Keine virtuelle Verschmelzung über Eintragsgrenzen.

import { calculateShiftHours, type CalculateShiftHoursOutput } from "../time/sfn/tagesabrechnung";
import { trimSecondsHHMM } from "./normalize";

export type ShiftSample = {
  staffId: string;
  businessDate: string; // YYYY-MM-DD
  /** Lokale Startzeit als HH:MM oder HH:MM:SS in Berlin-Wandzeit. */
  startLocal: string;
  /** Lokale Endzeit als HH:MM oder HH:MM:SS in Berlin-Wandzeit. */
  endLocal: string;
  sundayOrHoliday: boolean;
};

export type AggregateBucket = CalculateShiftHoursOutput & {
  staffId: string;
  bucketKey: string;
  entryCount: number;
};

function addBuckets(a: CalculateShiftHoursOutput, b: CalculateShiftHoursOutput): CalculateShiftHoursOutput {
  return {
    totalHours: round2(a.totalHours + b.totalHours),
    sundayHolidayHours: round2(a.sundayHolidayHours + b.sundayHolidayHours),
    eveningHours: round2(a.eveningHours + b.eveningHours),
    nightHours: round2(a.nightHours + b.nightHours),
    nightDeepHours: round2(a.nightDeepHours + b.nightDeepHours),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Aggregiert Schichten zu (staffId, bucketKey) — Bucket-Key liefert der Caller
 * (z. B. businessDate, ISO-Woche, Abrechnungszyklus). Jede Schicht wird einzeln
 * gerechnet, dann werden Topfwerte summiert.
 */
export function aggregate(
  shifts: ShiftSample[],
  bucketKeyOf: (s: ShiftSample) => string,
): AggregateBucket[] {
  const map = new Map<string, AggregateBucket>();
  for (const s of shifts) {
    const key = `${s.staffId}::${bucketKeyOf(s)}`;
    const single = calculateShiftHours({
      start: trimSecondsHHMM(s.startLocal),
      end: trimSecondsHHMM(s.endLocal),
      sundayOrHoliday: s.sundayOrHoliday,
    });
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        staffId: s.staffId,
        bucketKey: bucketKeyOf(s),
        entryCount: 1,
        ...single,
      });
    } else {
      const sum = addBuckets(existing, single);
      map.set(key, { ...existing, entryCount: existing.entryCount + 1, ...sum });
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.staffId === b.staffId ? a.bucketKey.localeCompare(b.bucketKey) : a.staffId.localeCompare(b.staffId),
  );
}

/** Abrechnungszyklus 26.→25.: ISO-Datum eines Tages auf Zyklus-Endmonat-YYYY-MM mappen. */
export function cycleKey(businessDate: string): string {
  const [y, m, d] = businessDate.split("-").map(Number);
  if (!y || !m || !d) return businessDate;
  // Tag 26..31 gehört zum Zyklus, der im FOLGEMONAT am 25. endet.
  const endMonth = d >= 26 ? m + 1 : m;
  const endYear = endMonth > 12 ? y + 1 : y;
  const normMonth = endMonth > 12 ? 1 : endMonth;
  return `${endYear}-${String(normMonth).padStart(2, "0")}`;
}

/** ISO-Wochen-Key YYYY-Www (Mo-So). */
export function isoWeekKey(businessDate: string): string {
  const [y, m, d] = businessDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((dt.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}