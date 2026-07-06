// UP1 — read-only Server-Function für den Jahresplaner auf /admin/urlaub.
// Quelle: `roster_absence` mit `type='urlaub'` (operative Wahrheit, in die
// die Antrags-Genehmigung expandiert). Kein Schreibpfad.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { ForbiddenError } from "@/lib/admin/role-guard";
import { resolvePlanerScope, assertScopeNotEmpty } from "./scope-util";
import { dailyVacationCounts, mergeAbsenceRanges, type AbsenceRange } from "./vacation-planner";

// PL1 — planer zusätzlich zugelassen; Rechte-Check via has_permission und
// Bereichs-Blöcke werden auf den Scope reduziert.
const READ_ROLES = ["manager", "admin", "planer"] as const;

export type VacationPlannerStaff = {
  staffId: string;
  displayName: string;
  ranges: AbsenceRange[];
};

export type VacationPlannerResult = {
  year: number;
  locationId: string;
  kitchen: VacationPlannerStaff[];
  service: VacationPlannerStaff[];
  dailyCounts: Record<string, number>;
};

export const getVacationPlanner = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        locationId: z.string().uuid(),
        year: z.number().int().min(2000).max(3000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<VacationPlannerResult> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, READ_ROLES);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // PL1 — Scope auflösen. Planer ohne Freigabe für diesen Standort ⇒ Forbidden.
    const scope = await resolvePlanerScope(
      context.supabase,
      supabaseAdmin,
      caller.organizationId,
      "roster.leave.view_all",
    );
    // PL2 — Aufrufer ohne jede Freigabe (keine Rolle, keine Overrides) ⇒ Forbidden.
    assertScopeNotEmpty(scope, "roster.leave.view_all");
    if (!scope.all) {
      const locationInScope = scope.combos.some((c) => c.locationId === data.locationId);
      if (!locationInScope) {
        throw new ForbiddenError("Standort liegt außerhalb deines Bereichs.");
      }
    }

    const { data: sl, error: slErr } = await supabaseAdmin
      .from("staff_locations")
      .select("staff_id, department, staff(id, display_name, is_active)")
      .eq("organization_id", caller.organizationId)
      .eq("location_id", data.locationId);
    if (slErr) throw slErr;

    type Row = { staffId: string; displayName: string; department: "kitchen" | "service" };
    const seen = new Map<string, Row>();
    for (const r of sl ?? []) {
      const s = r.staff as { id: string; display_name: string; is_active: boolean } | null;
      if (!s || s.is_active === false) continue;
      const dept = r.department as "kitchen" | "service" | "gl";
      const mapped: Row["department"] = dept === "kitchen" ? "kitchen" : "service";
      // PL1/BB (05.07.): Jahresplaner ist bewusst standort-gattert, nicht
      // bereichs-gattert — hat der Planer irgendeinen Bereich an diesem
      // Standort frei, sieht er BEIDE Bereichs-Blöcke (Küche + Service).
      // Die Antragsliste (listLeaveRequests) filtert weiterhin per Bereich.
      if (!scope.all) {
        const locOk = scope.combos.some((c) => c.locationId === data.locationId);
        if (!locOk) continue;
      }
      const key = `${s.id}::${mapped}`;
      if (!seen.has(key)) {
        seen.set(key, { staffId: s.id, displayName: s.display_name, department: mapped });
      }
    }
    const rowsArr = Array.from(seen.values());
    const staffIds = Array.from(new Set(rowsArr.map((r) => r.staffId)));

    const yearStart = `${data.year}-01-01`;
    const yearEnd = `${data.year}-12-31`;

    const { data: abs, error: absErr } =
      staffIds.length === 0
        ? { data: [], error: null }
        : await supabaseAdmin
            .from("roster_absence")
            .select("staff_id, date")
            .eq("organization_id", caller.organizationId)
            .eq("type", "urlaub")
            .gte("date", yearStart)
            .lte("date", yearEnd)
            .in("staff_id", staffIds);
    if (absErr) throw absErr;

    const datesByStaff = new Map<string, string[]>();
    for (const a of abs ?? []) {
      const sid = a.staff_id as string;
      const arr = datesByStaff.get(sid) ?? [];
      arr.push(a.date as string);
      datesByStaff.set(sid, arr);
    }

    const buildStaff = (r: Row): VacationPlannerStaff => ({
      staffId: r.staffId,
      displayName: r.displayName,
      ranges: mergeAbsenceRanges(datesByStaff.get(r.staffId) ?? [], data.year),
    });

    const kitchen = rowsArr
      .filter((r) => r.department === "kitchen")
      .map(buildStaff)
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "de"));
    const service = rowsArr
      .filter((r) => r.department === "service")
      .map(buildStaff)
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "de"));

    const rangesByStaff = new Map<string, { start: string; end: string }[]>();
    for (const [sid, dates] of datesByStaff) {
      rangesByStaff.set(sid, mergeAbsenceRanges(dates, data.year));
    }
    const counts = dailyVacationCounts(rangesByStaff, data.year);
    const dailyCounts: Record<string, number> = {};
    for (const [k, v] of counts) dailyCounts[k] = v;

    return {
      year: data.year,
      locationId: data.locationId,
      kitchen,
      service,
      dailyCounts,
    };
  });
