// 13-Wochen-Diagnose (READ-ONLY): aus dem Muster der letzten 91 Tage vor Periodenbeginn
// die regulären Arbeits-Wochentage ableiten und Urlaub/Krank-Tage der Periode darauf
// einschränken. Liefert zusätzlich Tagesdurchschnitte (Stunden, SFN-Cent) aus dem
// Referenzfenster. Erzeugt KEINE Lohnart, verändert KEIN Brutto.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { aggregateSfnPeriod } from "./lohn-period.functions";
import { workRate, estimateWorkdays } from "./urlaub-krank-core";

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
}

export async function computeUrlaubKrankDiagnose(
  supabaseAdmin: SupabaseClient<Database>,
  args: {
    staffId: string;
    organizationId: string;
    fromDate: string;
    toDate: string;
    mode: "simple" | "extended";
    sollHoursPerDay: number;
  },
): Promise<UrlaubKrankDiagnose> {
  const refTo = addDaysIso(args.fromDate, -1);
  const refFrom = addDaysIso(args.fromDate, -91);

  const refAgg = await aggregateSfnPeriod(supabaseAdmin, args.staffId, refFrom, refTo);
  const chosen = args.mode === "extended" ? refAgg.extended : refAgg.simple;
  const avgSfnTagCent =
    refAgg.workdayCount > 0 ? Math.round(chosen.zuschlagCents / refAgg.workdayCount) : 0;
  const rate = workRate(refAgg.workdayCount, 91);

  const { data: absences, error: absErr } = await supabaseAdmin
    .from("roster_absence")
    .select("date, type")
    .eq("staff_id", args.staffId)
    .eq("organization_id", args.organizationId)
    .gte("date", args.fromDate)
    .lte("date", args.toDate)
    .in("type", ["urlaub", "krank"]);
  if (absErr) throw absErr;

  let urlaubCalDays = 0;
  let krankCalDays = 0;
  for (const a of absences ?? []) {
    if (a.type === "urlaub") urlaubCalDays += 1;
    else if (a.type === "krank") krankCalDays += 1;
  }

  return {
    urlaubTage: estimateWorkdays(urlaubCalDays, rate),
    krankTage: estimateWorkdays(krankCalDays, rate),
    avgStdTag: args.sollHoursPerDay,
    avgSfnTagCent,
  };
}