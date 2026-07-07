// Welle C — Server-Functions für Urlaubsanträge.
// MA-seitig: requestLeave, getMyLeaveRequests, cancelMyLeaveRequest.
// Manager-seitig: listLeaveRequests, decideLeaveRequest (guarded).
//
// Genehmigung expandiert den Datumsbereich über die SQL-Funktion
// approve_leave_request nach roster_absence (type='urlaub').

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { runWithPermission, assertPermission } from "@/lib/admin/admin-call";
import { writeAuditLog, makeAuditWriter } from "@/lib/admin/audit";
import { loadStaffCaller } from "@/lib/time/time.functions";
import { assertRealIdentity } from "@/lib/admin/impersonation";
import { ForbiddenError } from "@/lib/admin/role-guard";
import { resolvePlanerScope, assertScopeNotEmpty, type ResolvedScope } from "./scope-util";
import {
  canCancelLeave,
  canDecideLeave,
  countLeaveDays,
  isValidLeaveRange,
  type LeaveStatus,
} from "./leave-requests";
import { bavarianHolidaysBetween } from "./holiday-utils";

async function loadCountHolidays(
  admin: import("@supabase/supabase-js").SupabaseClient<
    import("@/integrations/supabase/types").Database
  >,
  organizationId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("organization_settings")
    .select("count_holidays_as_leave")
    .eq("organization_id", organizationId)
    .maybeSingle();
  return Boolean(data?.count_holidays_as_leave ?? false);
}

function holidaySetIfSkip(skip: boolean, start: string, end: string): Set<string> | undefined {
  return skip ? bavarianHolidaysBetween(start, end) : undefined;
}

// PL1 — planer wird als Rollen-Whitelist zugelassen; feingranulare Rechte-
// Prüfung übernimmt weiterhin has_permission (roster.leave.view_all/decide),
// Scope-Filter darüber hinaus resolvePlanerScope + staff_locations.
const WRITE_ROLES = ["manager", "admin", "planer"] as const;

/**
 * PL1 — filtert eine Menge Antragsteller-`staffIds` auf jene, die im Scope
 * des Aufrufers liegen. Scope-Anker: der Antragsteller hat mindestens EINE
 * staff_locations-Zeile mit einer freigegebenen (location, department)-
 * Kombination. `all=true` ⇒ Menge unverändert.
 */
async function filterStaffIdsToScope(
  supabaseAdmin: import("@supabase/supabase-js").SupabaseClient<
    import("@/integrations/supabase/types").Database
  >,
  organizationId: string,
  staffIds: string[],
  scope: ResolvedScope,
): Promise<Set<string>> {
  if (scope.all) return new Set(staffIds);
  if (staffIds.length === 0 || scope.combos.length === 0) return new Set();
  const { data, error } = await supabaseAdmin
    .from("staff_locations")
    .select("staff_id, location_id, department")
    .eq("organization_id", organizationId)
    .in("staff_id", staffIds);
  if (error) throw error;
  const comboSet = new Set(scope.combos.map((c) => `${c.locationId}::${c.area}`));
  const inScope = new Set<string>();
  for (const row of data ?? []) {
    const dept = row.department as string;
    if (dept !== "kitchen" && dept !== "service") continue;
    if (comboSet.has(`${row.location_id as string}::${dept}`)) {
      inScope.add(row.staff_id as string);
    }
  }
  return inScope;
}

export type LeaveRequestRow = {
  id: string;
  staffId: string;
  staffName: string | null;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: LeaveStatus;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
  days: number;
};

// =========================================================================
// MA
// =========================================================================

export const requestLeave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadStaffCaller(context.supabase, context.userId);
    assertRealIdentity(caller);
    await assertPermission(context.supabase, "roster.leave.request_self", null);
    if (!isValidLeaveRange(data.start_date, data.end_date)) {
      throw new Error("Bis-Datum muss am Von-Datum oder danach liegen.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const skip = !(await loadCountHolidays(supabaseAdmin, caller.organizationId));
    const days = countLeaveDays(
      data.start_date,
      data.end_date,
      holidaySetIfSkip(skip, data.start_date, data.end_date),
    );

    // Überschneidung mit eigenem offenem/genehmigtem Antrag?
    const { data: overlaps, error: overlapErr } = await supabaseAdmin
      .from("leave_requests")
      .select("id, start_date, end_date, status")
      .eq("organization_id", caller.organizationId)
      .eq("staff_id", caller.staffId)
      .in("status", ["offen", "genehmigt"])
      .lte("start_date", data.end_date)
      .gte("end_date", data.start_date);
    if (overlapErr) throw overlapErr;
    if ((overlaps ?? []).length > 0) {
      throw new Error(
        "Es existiert bereits ein offener oder genehmigter Antrag in diesem Zeitraum.",
      );
    }

    const { data: row, error } = await supabaseAdmin
      .from("leave_requests")
      .insert({
        organization_id: caller.organizationId,
        staff_id: caller.staffId,
        start_date: data.start_date,
        end_date: data.end_date,
        reason: data.reason && data.reason.length > 0 ? data.reason : null,
        status: "offen",
      })
      .select("id")
      .single();
    if (error) throw error;

    await writeAuditLog({
      organizationId: caller.organizationId,
      actorUserId: context.userId,
      actorStaffId: caller.staffId,
      action: "leave.requested",
      entity: "leave_request",
      entityId: row.id as string,
      meta: { start: data.start_date, end: data.end_date, tage: days },
    });

    return { id: row.id as string };
  });

export const getMyLeaveRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LeaveRequestRow[]> => {
    const caller = await loadStaffCaller(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const skipHolidays = !(await loadCountHolidays(supabaseAdmin, caller.organizationId));
    const { data, error } = await supabaseAdmin
      .from("leave_requests")
      .select(
        "id, staff_id, start_date, end_date, reason, status, decision_note, decided_at, created_at",
      )
      .eq("organization_id", caller.organizationId)
      .eq("staff_id", caller.staffId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id as string,
      staffId: r.staff_id as string,
      staffName: null,
      startDate: r.start_date as string,
      endDate: r.end_date as string,
      reason: (r.reason as string | null) ?? null,
      status: r.status as LeaveStatus,
      decisionNote: (r.decision_note as string | null) ?? null,
      decidedAt: (r.decided_at as string | null) ?? null,
      createdAt: r.created_at as string,
      days: countLeaveDays(
        r.start_date as string,
        r.end_date as string,
        holidaySetIfSkip(skipHolidays, r.start_date as string, r.end_date as string),
      ),
    }));
  });

export const cancelMyLeaveRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadStaffCaller(context.supabase, context.userId);
    assertRealIdentity(caller);
    await assertPermission(context.supabase, "roster.leave.request_self", null);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: snap, error: snapErr } = await supabaseAdmin
      .from("leave_requests")
      .select("id, staff_id, organization_id, status, start_date, end_date")
      .eq("id", data.id)
      .maybeSingle();
    if (snapErr) throw snapErr;
    if (!snap) throw new Error("Antrag nicht gefunden.");
    if (snap.organization_id !== caller.organizationId || snap.staff_id !== caller.staffId) {
      throw new Error("Antrag nicht gefunden.");
    }
    if (!canCancelLeave(snap.status as LeaveStatus)) {
      throw new Error("Antrag kann nicht mehr zurückgezogen werden.");
    }

    const { error: delErr } = await supabaseAdmin
      .from("leave_requests")
      .delete()
      .eq("id", data.id)
      .eq("organization_id", caller.organizationId)
      .eq("staff_id", caller.staffId);
    if (delErr) throw delErr;

    await writeAuditLog({
      organizationId: caller.organizationId,
      actorUserId: context.userId,
      actorStaffId: caller.staffId,
      action: "leave.cancelled",
      entity: "leave_request",
      entityId: data.id,
      meta: { start: snap.start_date, end: snap.end_date },
    });

    return { ok: true as const };
  });

// =========================================================================
// Manager
// =========================================================================

export const listLeaveRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        status: z.enum(["offen", "genehmigt", "abgelehnt", "alle"]).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<LeaveRequestRow[]> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, WRITE_ROLES);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const skipHolidays = !(await loadCountHolidays(supabaseAdmin, caller.organizationId));
    const status = data.status ?? "offen";
    let q = supabaseAdmin
      .from("leave_requests")
      .select(
        "id, staff_id, start_date, end_date, reason, status, decision_note, decided_at, created_at, staff:staff!leave_requests_staff_id_fkey(display_name)",
      )
      .eq("organization_id", caller.organizationId)
      .order("created_at", { ascending: false });
    if (status !== "alle") q = q.eq("status", status);
    const { data: rows, error } = await q;
    if (error) throw error;
    const scope = await resolvePlanerScope(
      context.supabase,
      supabaseAdmin,
      caller.organizationId,
      "roster.leave.view_all",
    );
    // PL2 — Aufrufer ohne jede Freigabe ⇒ Forbidden.
    assertScopeNotEmpty(scope, "roster.leave.view_all");
    // PL1 — Scope-Filter (admin/manager: all=true ⇒ Ergebnis unverändert).
    const staffIds = Array.from(new Set((rows ?? []).map((r) => r.staff_id as string)));
    const inScope = await filterStaffIdsToScope(
      supabaseAdmin,
      caller.organizationId,
      staffIds,
      scope,
    );
    return (rows ?? [])
      .filter((r) => inScope.has(r.staff_id as string))
      .map((r) => ({
        id: r.id as string,
        staffId: r.staff_id as string,
        staffName: (r.staff as { display_name: string } | null)?.display_name ?? null,
        startDate: r.start_date as string,
        endDate: r.end_date as string,
        reason: (r.reason as string | null) ?? null,
        status: r.status as LeaveStatus,
        decisionNote: (r.decision_note as string | null) ?? null,
        decidedAt: (r.decided_at as string | null) ?? null,
        createdAt: r.created_at as string,
        days: countLeaveDays(
          r.start_date as string,
          r.end_date as string,
          holidaySetIfSkip(skipHolidays, r.start_date as string, r.end_date as string),
        ),
      }));
  });

export const decideLeaveRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["genehmigt", "abgelehnt"]),
        decision_note: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, WRITE_ROLES);
    return runWithPermission(
      context.supabase,
      "roster.leave.decide",
      null,
      makeAuditWriter(caller),
      async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: snap, error: snapErr } = await supabaseAdmin
          .from("leave_requests")
          .select("id, organization_id, staff_id, start_date, end_date, status")
          .eq("id", data.id)
          .maybeSingle();
        if (snapErr) throw snapErr;
        if (!snap || snap.organization_id !== caller.organizationId) {
          throw new Error("Antrag nicht gefunden.");
        }
        // PL1 — Scope-Validierung des Antragstellers VOR jeder Schreibaktion.
        const scope = await resolvePlanerScope(
          context.supabase,
          supabaseAdmin,
          caller.organizationId,
          "roster.leave.decide",
        );
        const inScope = await filterStaffIdsToScope(
          supabaseAdmin,
          caller.organizationId,
          [snap.staff_id as string],
          scope,
        );
        if (!inScope.has(snap.staff_id as string)) {
          throw new ForbiddenError("Antrag liegt außerhalb deines Bereichs.");
        }
        if (!canDecideLeave(snap.status as LeaveStatus)) {
          throw new Error("Antrag wurde bereits entschieden.");
        }
        if (data.decision === "abgelehnt") {
          const note = (data.decision_note ?? "").trim();
          if (note.length < 3) {
            throw new Error("Ablehnung erfordert eine Begründung (mindestens 3 Zeichen).");
          }
          const { error: updErr } = await supabaseAdmin
            .from("leave_requests")
            .update({
              status: "abgelehnt",
              decided_by_staff_id: caller.staffId,
              decided_at: new Date().toISOString(),
              decision_note: note,
            })
            .eq("id", data.id)
            .eq("organization_id", caller.organizationId);
          if (updErr) throw updErr;
          return {
            result: { ok: true as const },
            audit: {
              action: "leave.rejected",
              entity: "leave_request",
              entityId: data.id,
              meta: { reason: note, staffId: snap.staff_id },
            },
          };
        }

        // genehmigt → RPC expandiert roster_absence
        const note =
          data.decision_note && data.decision_note.trim().length > 0
            ? data.decision_note.trim()
            : null;
        const { error: rpcErr } = await supabaseAdmin.rpc("approve_leave_request", {
          p_request_id: data.id,
          p_decided_by: caller.staffId,
          p_note: note ?? "",
        });
        if (rpcErr) throw rpcErr;

        const skipHolidays = !(await loadCountHolidays(supabaseAdmin, caller.organizationId));
        const tage = countLeaveDays(
          snap.start_date as string,
          snap.end_date as string,
          holidaySetIfSkip(skipHolidays, snap.start_date as string, snap.end_date as string),
        );
        return {
          result: { ok: true as const },
          audit: {
            action: "leave.approved",
            entity: "leave_request",
            entityId: data.id,
            meta: {
              staffId: snap.staff_id,
              start: snap.start_date,
              end: snap.end_date,
              tage,
            },
          },
        };
      },
    );
  });
