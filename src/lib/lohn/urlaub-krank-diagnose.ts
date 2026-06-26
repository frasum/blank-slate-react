// 13-Wochen-Diagnose (READ-ONLY): aus dem Muster der letzten 91 Tage vor Periodenbeginn
// die regulären Arbeits-Wochentage ableiten und Urlaub/Krank-Tage der Periode darauf
// einschränken. Liefert zusätzlich Tagesdurchschnitte (Stunden, SFN-Cent) aus dem
// Referenzfenster. Erzeugt KEINE Lohnart, verändert KEIN Brutto.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { aggregateSfnPeriod } from "./lohn-period.functions";
import {
  deriveWorkingWeekdays,
  countWorkdaysInAbsence,
} from "./urlaub-krank-core";

function addDaysIso(isoDate: string, delta: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export interface UrlaubKrankDiagnose {
  urlaubTage: number;
  krankTage: number;
  avgStdTag: number;
  avgSfnTagCent: number;
  workingWeekdays: number[];
}

export async function computeUrlaubKrankDiagnose(
  supabaseAdmin: SupabaseClient<Database>,
  args: {
    staffId: string;
    organizationId: string;
    fromDate: string;
    toDate: string;
    mode: "simple" | "extended";
  },
): Promise<UrlaubKrankDiagnose> {
  const refTo = addDaysIso(args.fromDate, -1);
  const refFrom = addDaysIso(args.fromDate, -91);

  const sfn = await aggregateSfnPeriod(supabaseAdmin, args.staffId, refFrom, refTo);
  const chosen = args.mode === "extended" ? sfn.extended : sfn.simple;
  const avgStdTag =
    sfn.workdayCount > 0 ? Math.round((sfn.totalHours / sfn.workdayCount) * 100) / 100 : 0;
  const avgSfnTagCent =
    sfn.workdayCount > 0 ? Math.round(chosen.zuschlagCents / sfn.workdayCount) : 0;

  const { data: worked, error: workedErr } = await supabaseAdmin
    .from("time_entries")
    .select("business_date")
    .eq("staff_id", args.staffId)
    .gte("business_date", refFrom)
    .lte("business_date", refTo)
    .not("ended_at", "is", null);
  if (workedErr) throw workedErr;
  const workedDatesSet = new Set<string>();
  for (const r of worked ?? []) {
    if (r.business_date) workedDatesSet.add(r.business_date as string);
  }
  const workingWeekdays = deriveWorkingWeekdays(Array.from(workedDatesSet));

  const { data: absences, error: absErr } = await supabaseAdmin
    .from("roster_absence")
    .select("date, type")
    .eq("staff_id", args.staffId)
    .eq("organization_id", args.organizationId)
    .gte("date", args.fromDate)
    .lte("date", args.toDate)
    .in("type", ["urlaub", "krank"]);
  if (absErr) throw absErr;

  const urlaubDates: string[] = [];
  const krankDates: string[] = [];
  for (const a of absences ?? []) {
    if (a.type === "urlaub") urlaubDates.push(a.date as string);
    else if (a.type === "krank") krankDates.push(a.date as string);
  }

  return {
    urlaubTage: countWorkdaysInAbsence(urlaubDates, workingWeekdays),
    krankTage: countWorkdaysInAbsence(krankDates, workingWeekdays),
    avgStdTag,
    avgSfnTagCent,
    workingWeekdays: Array.from(workingWeekdays).sort((a, b) => a - b),
  };
}