// 2b — Perioden-Aggregation für SFN-Zuschläge.
//
// Zustandslose, admin-gated Serverfunktion: liest time_entries einer Periode,
// erzeugt SFN-Rohzeilen via timeEntryToSfnRow und rechnet beide Modi
// (simple, extended) durch berechneSfnGeld. KEIN Schreiben, KEIN Audit-Log.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { timeEntryToSfnRow } from "./time-entry-sfn";
import { berechneSfnGeld } from "./sfn-geld/sfn-geld";
import type { SfnGeldErgebnis } from "./sfn-geld/types";
import { bavarianHolidaySurchargeRate } from "./holiday-rate";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export interface SfnPeriodAggregate {
  hourlyRateCents: number;
  totalHours: number;
  entryCount: number;
  simple: SfnGeldErgebnis;
  extended: SfnGeldErgebnis;
}

/**
 * Reine Aggregation: liest Stundensatz + abgeschlossene time_entries einer
 * Periode und berechnet beide SFN-Modi. Wird von zwei Server-Functions
 * geteilt (eine createServerFn darf keine andere createServerFn aufrufen).
 */
export async function aggregateSfnPeriod(
  supabaseAdmin: SupabaseClient<Database>,
  staffId: string,
  fromDate: string,
  toDate: string,
): Promise<SfnPeriodAggregate> {
  const { data: comp, error: compErr } = await supabaseAdmin
    .from("staff_compensation")
    .select("hourly_rate")
    .eq("staff_id", staffId)
    .maybeSingle();
  if (compErr) throw compErr;
  const hourlyRateCents = Math.round(Number(comp?.hourly_rate ?? 0) * 100);

  const { data: entries, error: entriesErr } = await supabaseAdmin
    .from("time_entries")
    .select("started_at, ended_at, business_date, break_minutes")
    .eq("staff_id", staffId)
    .gte("business_date", fromDate)
    .lte("business_date", toDate)
    .not("ended_at", "is", null);
  if (entriesErr) throw entriesErr;

  const rows = (entries ?? [])
    .filter((e) => e.ended_at != null)
    .map((e) =>
      timeEntryToSfnRow({
        startedAt: e.started_at,
        endedAt: e.ended_at as string,
        businessDate: e.business_date,
        breakMinutes: e.break_minutes ?? 0,
      }),
    );

  const holidayRates = new Map<string, number>();
  for (const r of rows) {
    if (r.isHoliday) holidayRates.set(r.shiftDate, bavarianHolidaySurchargeRate(r.shiftDate));
  }

  const simple = berechneSfnGeld(rows, "simple", hourlyRateCents, holidayRates);
  const extended = berechneSfnGeld(rows, "extended", hourlyRateCents, holidayRates);
  const totalHours = Math.round(rows.reduce((s, r) => s + r.totalHours, 0) * 100) / 100;

  return { hourlyRateCents, totalHours, entryCount: rows.length, simple, extended };
}

export const getSfnPeriodForStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        staffId: z.string().uuid(),
        fromDate: z.string().regex(dateRegex),
        toDate: z.string().regex(dateRegex),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: staff, error: staffErr } = await supabaseAdmin
      .from("staff")
      .select("id")
      .eq("id", data.staffId)
      .eq("organization_id", caller.organizationId)
      .maybeSingle();
    if (staffErr) throw staffErr;
    if (!staff) throw new Error("Mitarbeiter nicht in dieser Organisation.");

    return aggregateSfnPeriod(supabaseAdmin, data.staffId, data.fromDate, data.toDate);
  });
