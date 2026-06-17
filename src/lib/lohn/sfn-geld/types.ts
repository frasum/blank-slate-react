export type SfnMode = "simple" | "extended";

/** Eine Schicht-Zeile = Stunden-Töpfe aus calculateShiftHours + Feiertags-Info. */
export interface SfnShiftRow {
  totalHours: number;
  eveningHours: number;
  nightHours: number;
  nightDeepHours: number;
  sundayHolidayHours: number;
  isHoliday: boolean;
  /** "YYYY-MM-DD" */
  shiftDate: string;
}

export interface SfnBuckets {
  night25Hours: number;
  night40Hours: number;
  sundayHours: number;
  holidayHours: number;
  holiday150Hours: number;
}

export interface SfnGeldErgebnis extends SfnBuckets {
  /** Steuerfreier Zuschlag gesamt in Cent (eine Summe, am Ende cent-gerundet — Original-Verhalten). */
  zuschlagCents: number;
}