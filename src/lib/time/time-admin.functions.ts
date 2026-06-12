// B2b — Manager-Korrektur-Server-Functions für time_entries + Admin-Wasserlinie.
//
// Architektur:
//   * Alle Schreibvorgänge laufen via supabaseAdmin (RLS auf time_entries ist DENY-ALL).
//   * runGuarded prüft Rolle VOR der Operation; audit_log NUR bei Erfolg.
//   * G2-Sperrlogik via assertBusinessDateUnlocked: business_date ≤ Wasserlinie
//     blockiert ALLE Rollen (auch Manager) → KEIN audit_log-Eintrag (Gate d).
//   * source bleibt erhalten, wenn vorher 'clock' (kein stilles Umflaggen).
//   * manual_delete schreibt vollständigen Zeilen-Snapshot in audit_log.meta
//     (Gate e — Rekonstruierbarkeit aus append-only log).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { runGuarded } from "@/lib/admin/admin-call";
import { writeAuditLog } from "@/lib/admin/audit";
import { businessDateOf } from "@/lib/business-date";
import { assertBusinessDateUnlocked, loadTimeLock } from "./time-lock";
import { arbzgMinimumBreak, isArbzgShort, grossMinutesBetween } from "./break-rules";

function makeAuditWriter(caller: { organizationId: string; userId: string; staffId: string }) {
  return async (entry: { action: string; entity: string; entityId?: string; meta?: Record<string, unknown> }) => {
    await writeAuditLog({
      organizationId: caller.organizationId,
      actorUserId: caller.userId,
      actorStaffId: caller.staffId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      meta: entry.meta,
    });
  };
}

// =========================================================================
// Lesen — Manager+
// =========================================================================

export const listEntriesForCorrection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        staffId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("time_entries")
      .select(
        "id, staff_id, started_at, ended_at, business_date, break_minutes, source, location_id, staff(display_name)",
      )
      .eq("organization_id", caller.organizationId)
      .gte("business_date", data.from)
      .lte("business_date", data.to)
      .order("business_date", { ascending: false })
      .order("started_at", { ascending: false });
    if (data.staffId) q = q.eq("staff_id", data.staffId);
    const { data: rows, error } = await q;
    if (error) throw error;
    const through = await loadTimeLock(supabaseAdmin, caller.organizationId);
    return {
      lockedThrough: through,
      entries: (rows ?? []).map((r) => ({
        id: r.id,
        staffId: r.staff_id,
        staffName: (r.staff as { display_name: string } | null)?.display_name ?? "—",
        startedAt: r.started_at,
        endedAt: r.ended_at,
        businessDate: r.business_date,
        breakMinutes: r.break_minutes,
        source: r.source,
        locationId: r.location_id,
      })),
    };
  });

export const getTimeLockSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const through = await loadTimeLock(supabaseAdmin, caller.organizationId);
    return { lockedThrough: through };
  });

// =========================================================================
// Schreiben — Manager (Korrektur) / Admin (Wasserlinie)
// =========================================================================

const entryWriteSchema = z.object({
  staffId: z.string().uuid(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  breakMinutes: z.number().int().min(0).max(479),
  reason: z.string().trim().min(3).max(500),
});

function assertOrder(startedAt: string, endedAt: string | null): void {
  if (!endedAt) return;
  if (new Date(endedAt).getTime() <= new Date(startedAt).getTime()) {
    throw new Error("Ende muss nach dem Beginn liegen.");
  }
}

function computeArbzgMeta(startedAt: string, endedAt: string | null, breakMinutes: number) {
  if (!endedAt) return { arbzgShort: false, grossMinutes: null as number | null };
  const gross = grossMinutesBetween(new Date(startedAt), new Date(endedAt));
  return {
    arbzgShort: isArbzgShort(gross, breakMinutes),
    grossMinutes: gross,
    arbzgRecommended: arbzgMinimumBreak(gross),
  };
}

export const createManualEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => entryWriteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      assertOrder(data.startedAt, data.endedAt);
      const businessDate = businessDateOf(new Date(data.startedAt));
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await assertBusinessDateUnlocked(supabaseAdmin, caller.organizationId, businessDate);

      // Staff gehört zur Org?
      const { data: staff, error: sErr } = await supabaseAdmin
        .from("staff")
        .select("id")
        .eq("id", data.staffId)
        .eq("organization_id", caller.organizationId)
        .maybeSingle();
      if (sErr) throw sErr;
      if (!staff) throw new Error("Mitarbeiter nicht in dieser Organisation.");

      const { data: created, error } = await supabaseAdmin
        .from("time_entries")
        .insert({
          organization_id: caller.organizationId,
          staff_id: data.staffId,
          started_at: data.startedAt,
          ended_at: data.endedAt,
          business_date: businessDate,
          break_minutes: data.breakMinutes,
          source: "manual",
        })
        .select("id")
        .single();
      if (error) throw error;

      const arbzg = computeArbzgMeta(data.startedAt, data.endedAt, data.breakMinutes);
      return {
        result: { id: created.id },
        audit: {
          action: "time_entry.manual_create",
          entity: "time_entry",
          entityId: created.id,
          meta: {
            reason: data.reason,
            staffId: data.staffId,
            businessDate,
            startedAt: data.startedAt,
            endedAt: data.endedAt,
            breakMinutes: data.breakMinutes,
            ...arbzg,
          },
        },
      };
    });
  });

export const updateTimeEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        startedAt: z.string().datetime(),
        endedAt: z.string().datetime().nullable(),
        breakMinutes: z.number().int().min(0).max(479),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      assertOrder(data.startedAt, data.endedAt);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: before, error: loadErr } = await supabaseAdmin
        .from("time_entries")
        .select("*")
        .eq("id", data.id)
        .eq("organization_id", caller.organizationId)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!before) throw new Error("Eintrag nicht gefunden.");

      const newBusinessDate = businessDateOf(new Date(data.startedAt));
      // Sperre prüft sowohl alten als auch neuen Geschäftstag.
      await assertBusinessDateUnlocked(supabaseAdmin, caller.organizationId, before.business_date);
      if (newBusinessDate !== before.business_date) {
        await assertBusinessDateUnlocked(supabaseAdmin, caller.organizationId, newBusinessDate);
      }

      const { error } = await supabaseAdmin
        .from("time_entries")
        .update({
          started_at: data.startedAt,
          ended_at: data.endedAt,
          business_date: newBusinessDate,
          break_minutes: data.breakMinutes,
          // source bleibt erhalten — kein stilles Umflaggen von 'clock' auf 'manual'.
        })
        .eq("id", data.id)
        .eq("organization_id", caller.organizationId);
      if (error) throw error;

      const arbzg = computeArbzgMeta(data.startedAt, data.endedAt, data.breakMinutes);
      return {
        result: { ok: true as const },
        audit: {
          action: "time_entry.manual_update",
          entity: "time_entry",
          entityId: data.id,
          meta: {
            reason: data.reason,
            before: {
              startedAt: before.started_at,
              endedAt: before.ended_at,
              businessDate: before.business_date,
              breakMinutes: before.break_minutes,
            },
            after: {
              startedAt: data.startedAt,
              endedAt: data.endedAt,
              businessDate: newBusinessDate,
              breakMinutes: data.breakMinutes,
            },
            ...arbzg,
          },
        },
      };
    });
  });

export const deleteTimeEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), reason: z.string().trim().min(3).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: snapshot, error: loadErr } = await supabaseAdmin
        .from("time_entries")
        .select("*")
        .eq("id", data.id)
        .eq("organization_id", caller.organizationId)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!snapshot) throw new Error("Eintrag nicht gefunden.");

      await assertBusinessDateUnlocked(supabaseAdmin, caller.organizationId, snapshot.business_date);

      const { error } = await supabaseAdmin
        .from("time_entries")
        .delete()
        .eq("id", data.id)
        .eq("organization_id", caller.organizationId);
      if (error) throw error;

      return {
        result: { ok: true as const },
        audit: {
          action: "time_entry.manual_delete",
          entity: "time_entry",
          entityId: data.id,
          // Gate (e): vollständiger Zeilen-Snapshot in meta. Append-only log
          // muss gelöschte Arbeitszeiten rekonstruierbar erhalten.
          meta: {
            reason: data.reason,
            snapshot: {
              staffId: snapshot.staff_id,
              startedAt: snapshot.started_at,
              endedAt: snapshot.ended_at,
              businessDate: snapshot.business_date,
              breakMinutes: snapshot.break_minutes,
              source: snapshot.source,
              locationId: snapshot.location_id,
              createdAt: snapshot.created_at,
              updatedAt: snapshot.updated_at,
            },
          },
        },
      };
    });
  });

export const setTimeLock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        throughDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const before = await loadTimeLock(supabaseAdmin, caller.organizationId);

      // Settings-Zeile garantiert vorhanden (Migration), aber sicherheitshalber upsert.
      const { error } = await supabaseAdmin
        .from("organization_settings")
        .upsert(
          {
            organization_id: caller.organizationId,
            time_locked_through_date: data.throughDate,
          },
          { onConflict: "organization_id" },
        );
      if (error) throw error;

      return {
        result: { ok: true as const, lockedThrough: data.throughDate },
        audit: {
          action: "settings.time_lock_moved",
          entity: "organization_settings",
          entityId: caller.organizationId,
          meta: { before, after: data.throughDate },
        },
      };
    });
  });