// PV3 — Server-Fns für den POS-Stundenbericht.
//
// Muster wie PV1/PV2 (sales-stats.functions.ts): DENY-ALL auf
// pos_hourly_stats, alle Reads via loadAdminCaller("manager") + supabaseAdmin,
// locationId gegen Aufrufer-Org geprüft. Schreiben nur als admin.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { writeAuditLog } from "@/lib/admin/audit";
import type { Database } from "@/integrations/supabase/types";
import { ReplacePosHourlyStatsInput, checkHourlyAgainstFooter } from "./pos-hourly-server";

type Admin = SupabaseClient<Database>;

async function assertLocationInOrg(
  admin: Admin,
  organizationId: string,
  locationId: string,
): Promise<void> {
  const { data, error } = await admin
    .from("locations")
    .select("id")
    .eq("id", locationId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Standort gehört nicht zur aktiven Organisation.");
}

const ListInput = z.object({
  locationId: z.string().uuid(),
  period: z.enum(["d365", "alltime"]),
});

export type PosHourlyRowRead = { hour: number; anzahl: number; wertCents: number };
export type PosHourlyResult = {
  rows: PosHourlyRowRead[];
  reportDate: string | null;
};

export const listPosHourlyStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ListInput.parse(input))
  .handler(async ({ data, context }): Promise<PosHourlyResult> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertLocationInOrg(supabaseAdmin, caller.organizationId, data.locationId);

    const { data: res, error } = await supabaseAdmin
      .from("pos_hourly_stats")
      .select("hour, anzahl, wert_cents, report_date")
      .eq("organization_id", caller.organizationId)
      .eq("location_id", data.locationId)
      .eq("period", data.period)
      .order("hour", { ascending: true });
    if (error) throw new Error(error.message);

    const rows: PosHourlyRowRead[] = (res ?? []).map((r) => ({
      hour: Number(r.hour),
      anzahl: Number(r.anzahl),
      wertCents: Number(r.wert_cents),
    }));
    const reportDate = (res ?? []).reduce<string | null>(
      (acc, r) => (acc === null || r.report_date > acc ? r.report_date : acc),
      null,
    );
    return { rows, reportDate };
  });

export type ReplacePosHourlyResult = {
  ok: true;
  hourCount: number;
  sumAnzahl: number;
  sumCents: number;
};

export const replacePosHourlyStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ReplacePosHourlyStatsInput.parse(input))
  .handler(async ({ data, context }): Promise<ReplacePosHourlyResult> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertLocationInOrg(supabaseAdmin, caller.organizationId, data.locationId);

    const sum = checkHourlyAgainstFooter(data.rows, data.footer);
    if (!sum.matches) {
      throw new Error(
        `Summen der Stunden stimmen nicht mit der Fußzeile überein — Import abgelehnt. Zeilen: ${sum.sumAnzahl} / ${(sum.sumCents / 100).toFixed(2)} €, Fußzeile: ${data.footer.anzahl} / ${(data.footer.wertCents / 100).toFixed(2)} €.`,
      );
    }

    const { error } = await supabaseAdmin.rpc("replace_pos_hourly_stats", {
      p_organization_id: caller.organizationId,
      p_location_id: data.locationId,
      p_period: data.period,
      p_report_date: data.reportDate,
      p_rows: data.rows,
    });
    if (error) throw new Error(error.message);

    await writeAuditLog({
      organizationId: caller.organizationId,
      actorUserId: caller.userId,
      actorStaffId: caller.staffId,
      action: "pos_hourly.replaced",
      entity: "pos_hourly_stats",
      meta: {
        locationId: data.locationId,
        period: data.period,
        reportDate: data.reportDate,
        hourCount: data.rows.length,
        sumAnzahl: sum.sumAnzahl,
        sumCents: sum.sumCents,
      },
    });

    return {
      ok: true,
      hourCount: data.rows.length,
      sumAnzahl: sum.sumAnzahl,
      sumCents: sum.sumCents,
    };
  });
