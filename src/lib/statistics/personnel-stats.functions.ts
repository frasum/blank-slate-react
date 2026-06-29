// M-Statistik S-8 — Read-Server-Fn: Personalquote-Basisdaten pro
// Kalendermonat (oder freies Datumsfenster) inkl. Vorperiode + Trend.
//
// EHRLICHKEITSREGEL: liefert *Basis-Brutto-Lohnkosten* (Netto-Stunden ×
// staff_compensation.hourly_rate in EUR). Bewusst NICHT enthalten:
// Arbeitgeber-SV-Anteil, SFN-Zuschläge, zweiter Satz `hourly_rate_2`.
// Werte sind eine Näherung — NICHT die volle Arbeitgeberkostenquote.
//
// Die Personalquote selbst (cost/revenue) wird hier nicht gerechnet.
// Die UI kombiniert getPersonnelStats + getRevenueStats und ruft
// personnelRatioPct(...) aus personnel-core (einzige Quote-Definition).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { grossMinutesBetween } from "@/lib/time/break-rules";
import { computeTrend, type Trend } from "./revenue-core";
import {
  currentMonth,
  monthRange,
  previousMonthRange,
  previousRangeForDates,
} from "./period-window";
import {
  aggregatePersonnel,
  type CompRow,
  type PersonnelAgg,
  type WorkEntry,
} from "./personnel-core";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

type Window = { startDate: string; endDate: string };

type WindowResult = {
  agg: PersonnelAgg;
  totalNetMinutes: number; // ganzzahlig, für Trend
  staffIds: string[];
};

export const getPersonnelStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        month: z.string().regex(MONTH_RE).optional(),
        startDate: z.string().regex(DATE_RE).optional(),
        endDate: z.string().regex(DATE_RE).optional(),
        locationId: z.string().uuid().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, [
      "manager",
      "admin",
      "payroll",
    ]);
    const org = caller.organizationId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Zeitraum + Vorperiode auflösen (identisch zu getTipStats).
    let current: Window;
    let previous: Window | null;
    let label: string | null;

    if (data.month) {
      current = monthRange(data.month);
      previous = previousMonthRange(data.month);
      label = data.month;
    } else if (data.startDate && data.endDate) {
      if (data.endDate < data.startDate) {
        throw new Error("endDate muss ≥ startDate sein.");
      }
      current = { startDate: data.startDate, endDate: data.endDate };
      previous = previousRangeForDates(data.startDate, data.endDate);
      label = null;
    } else if (!data.startDate && !data.endDate) {
      const m = currentMonth();
      current = monthRange(m);
      previous = previousMonthRange(m);
      label = m;
    } else {
      throw new Error("startDate und endDate müssen gemeinsam gesetzt sein.");
    }

    async function loadWindow(win: Window): Promise<WindowResult> {
      let q = supabaseAdmin
        .from("time_entries")
        .select("staff_id, started_at, ended_at, break_minutes, business_date, location_id")
        .eq("organization_id", org)
        .gte("business_date", win.startDate)
        .lte("business_date", win.endDate)
        .not("ended_at", "is", null);
      if (data.locationId) {
        q = q.eq("location_id", data.locationId);
      }
      const { data: rows, error } = await q;
      if (error) throw error;

      const entries: WorkEntry[] = [];
      const staffIdSet = new Set<string>();
      let totalNetMinutes = 0;
      for (const r of rows ?? []) {
        if (!r.ended_at || !r.started_at || !r.business_date || !r.staff_id) continue;
        const gross = grossMinutesBetween(new Date(r.started_at), new Date(r.ended_at));
        const net = Math.max(0, gross - (r.break_minutes ?? 0));
        totalNetMinutes += net;
        staffIdSet.add(r.staff_id);
        entries.push({
          staffId: r.staff_id,
          businessDate: r.business_date,
          netMinutes: net,
        });
      }
      const staffIds = Array.from(staffIdSet);

      const compByStaff: Record<string, CompRow[]> = {};
      if (staffIds.length > 0) {
        const { data: comp, error: compErr } = await supabaseAdmin
          .from("staff_compensation")
          .select("staff_id, valid_from, hourly_rate")
          .eq("organization_id", org)
          .in("staff_id", staffIds);
        if (compErr) throw compErr;
        for (const c of comp ?? []) {
          if (!c.staff_id || !c.valid_from || c.hourly_rate === null) continue;
          (compByStaff[c.staff_id] ??= []).push({
            validFrom: c.valid_from,
            hourlyRateEur: Number(c.hourly_rate),
          });
        }
      }

      const agg = aggregatePersonnel(entries, compByStaff);
      return { agg, totalNetMinutes, staffIds };
    }

    const cur = await loadWindow(current);
    const prev = previous ? await loadWindow(previous) : null;

    // Staff-Namen für perStaff (Pattern aus cash.functions.ts: id, display_name).
    const nameIds = cur.agg.perStaff.map((p) => p.staffId);
    const staffNames: Record<string, string> = {};
    if (nameIds.length > 0) {
      const { data: staffRows, error: staffErr } = await supabaseAdmin
        .from("staff")
        .select("id, display_name")
        .eq("organization_id", org)
        .in("id", nameIds);
      if (staffErr) throw staffErr;
      for (const s of staffRows ?? []) {
        staffNames[s.id] = s.display_name ?? s.id;
      }
    }

    const trend: { hours: Trend; cost: Trend } | null = prev
      ? {
          // Trend auf ganzzahligen Netto-Minuten (computeTrend erwartet ints).
          hours: computeTrend(cur.totalNetMinutes, prev.totalNetMinutes),
          cost: computeTrend(cur.agg.totalLaborCostCents, prev.agg.totalLaborCostCents),
        }
      : null;

    return {
      range: { startDate: current.startDate, endDate: current.endDate, label },
      totals: {
        netHours: cur.agg.totalNetHours,
        laborCostCents: cur.agg.totalLaborCostCents,
      },
      perStaff: cur.agg.perStaff.map((p) => ({
        staffId: p.staffId,
        name: staffNames[p.staffId] ?? p.staffId,
        netHours: p.netHours,
        laborCostCents: p.laborCostCents,
      })),
      staffWithoutRate: cur.agg.staffWithoutRate,
      previous: prev
        ? {
            netHours: prev.agg.totalNetHours,
            laborCostCents: prev.agg.totalLaborCostCents,
          }
        : null,
      trend,
    };
  });
