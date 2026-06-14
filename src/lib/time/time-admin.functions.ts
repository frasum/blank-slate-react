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
  return async (entry: {
    action: string;
    entity: string;
    entityId?: string;
    meta?: Record<string, unknown>;
  }) => {
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

      await assertBusinessDateUnlocked(
        supabaseAdmin,
        caller.organizationId,
        snapshot.business_date,
      );

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
        throughDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const before = await loadTimeLock(supabaseAdmin, caller.organizationId);

      // Settings-Zeile garantiert vorhanden (Migration), aber sicherheitshalber upsert.
      const { error } = await supabaseAdmin.from("organization_settings").upsert(
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

// =========================================================================
// B6 — Arbeitszeitübersicht (Zusammenfassung + Buchhaltung)
// =========================================================================

export const getTimeOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        locationId: z.string().uuid(),
        fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, [
      "manager",
      "admin",
      "payroll",
    ]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("time_entries")
      .select("staff_id, business_date, started_at, ended_at, source, staff(display_name)")
      .eq("organization_id", caller.organizationId)
      .eq("location_id", data.locationId)
      .gte("business_date", data.fromDate)
      .lte("business_date", data.toDate)
      .not("ended_at", "is", null)
      .order("business_date", { ascending: true });
    if (error) throw error;

    const { data: deptRows, error: deptErr } = await supabaseAdmin
      .from("staff_locations")
      .select("staff_id, department")
      .eq("organization_id", caller.organizationId)
      .eq("location_id", data.locationId);
    if (deptErr) throw deptErr;
    const deptByStaff = new Map<string, "kitchen" | "service" | "gl">();
    for (const d of deptRows ?? []) {
      deptByStaff.set(d.staff_id, d.department as "kitchen" | "service" | "gl");
    }

    const entries = (rows ?? []).map((r) => {
      const started = new Date(r.started_at).getTime();
      const ended = new Date(r.ended_at as string).getTime();
      const hoursWorked = Math.max(0, (ended - started) / 3_600_000);
      return {
        staffId: r.staff_id,
        displayName: (r.staff as { display_name: string } | null)?.display_name ?? "—",
        department: deptByStaff.get(r.staff_id) ?? ("service" as const),
        businessDate: r.business_date as string,
        hoursWorked,
        source: r.source as string,
      };
    });
    return { entries };
  });

export const listPayrollNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        locationId: z.string().uuid(),
        periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, [
      "manager",
      "admin",
      "payroll",
    ]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("payroll_notes")
      .select("staff_id, vorschuss, besonderheiten")
      .eq("organization_id", caller.organizationId)
      .eq("location_id", data.locationId)
      .eq("period_start", data.periodStart)
      .eq("period_end", data.periodEnd);
    if (error) throw error;
    return (rows ?? []).map((r) => ({
      staffId: r.staff_id,
      vorschuss: Number(r.vorschuss ?? 0),
      besonderheiten: r.besonderheiten ?? "",
    }));
  });

export const upsertPayrollNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        locationId: z.string().uuid(),
        staffId: z.string().uuid(),
        periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        vorschuss: z.number().min(0).max(100000),
        besonderheiten: z.string().max(2000).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.from("payroll_notes").upsert(
        {
          organization_id: caller.organizationId,
          staff_id: data.staffId,
          location_id: data.locationId,
          period_start: data.periodStart,
          period_end: data.periodEnd,
          vorschuss: data.vorschuss,
          besonderheiten: data.besonderheiten,
        },
        { onConflict: "staff_id,location_id,period_start,period_end" },
      );
      if (error) throw error;
      return {
        result: { ok: true as const },
        audit: {
          action: "payroll_note.upsert",
          entity: "payroll_note",
          meta: {
            staffId: data.staffId,
            locationId: data.locationId,
            periodStart: data.periodStart,
            periodEnd: data.periodEnd,
            vorschuss: data.vorschuss,
            besonderheiten: data.besonderheiten,
          },
        },
      };
    });
  });

// =========================================================================
// B6b — Wochenplan (Wochen-Ansicht für genau eine ISO-Woche)
// =========================================================================

export const getWeeklyTimeEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        locationId: z.string().uuid(),
        weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // weekEnd = weekStart + 6 Tage (Sonntag)
    const start = new Date(`${data.weekStart}T12:00:00Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    const weekEnd = end.toISOString().slice(0, 10);

    // 1. Einträge am Zielstandort.
    const { data: rows, error } = await supabaseAdmin
      .from("time_entries")
      .select("id, staff_id, started_at, ended_at, business_date, location_id, staff(display_name)")
      .eq("organization_id", caller.organizationId)
      .eq("location_id", data.locationId)
      .gte("business_date", data.weekStart)
      .lte("business_date", weekEnd)
      .not("ended_at", "is", null)
      .order("started_at", { ascending: true });
    if (error) throw error;

    // 2. Einträge an ANDEREN Standorten in derselben Woche (gesamte Org).
    const { data: crossRows, error: crossErr } = await supabaseAdmin
      .from("time_entries")
      .select("staff_id, business_date, location_id")
      .eq("organization_id", caller.organizationId)
      .neq("location_id", data.locationId)
      .gte("business_date", data.weekStart)
      .lte("business_date", weekEnd)
      .not("ended_at", "is", null);
    if (crossErr) throw crossErr;

    // 3. Abteilungen für diesen Standort.
    const { data: deptRows, error: deptErr } = await supabaseAdmin
      .from("staff_locations")
      .select("staff_id, department")
      .eq("organization_id", caller.organizationId)
      .eq("location_id", data.locationId);
    if (deptErr) throw deptErr;
    const deptByStaff = new Map<string, "kitchen" | "service" | "gl">();
    for (const d of deptRows ?? []) {
      deptByStaff.set(d.staff_id, d.department as "kitchen" | "service" | "gl");
    }

    const crossLocationDates: Record<string, string[]> = {};
    for (const c of crossRows ?? []) {
      const key = c.staff_id as string;
      const date = c.business_date as string;
      const arr = crossLocationDates[key] ?? [];
      if (!arr.includes(date)) arr.push(date);
      crossLocationDates[key] = arr;
    }

    return {
      weekStart: data.weekStart,
      weekEnd,
      entries: (rows ?? []).map((r) => ({
        id: r.id as string,
        staffId: r.staff_id as string,
        displayName: (r.staff as { display_name: string } | null)?.display_name ?? "—",
        department: deptByStaff.get(r.staff_id as string) ?? ("service" as const),
        businessDate: r.business_date as string,
        startedAt: r.started_at as string,
        endedAt: r.ended_at as string,
      })),
      crossLocationDates,
    };
  });

// B6c — Inline-Edit/Create für Wochenplan (Admin)
// Schmaler Wrapper, der nur Start/Ende setzt und break_minutes erhält bzw. 0 setzt.

export const setTimeEntryShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        startedAt: z.string().datetime(),
        endedAt: z.string().datetime(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      if (new Date(data.endedAt).getTime() <= new Date(data.startedAt).getTime()) {
        throw new Error("Ende muss nach dem Beginn liegen.");
      }
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
        })
        .eq("id", data.id)
        .eq("organization_id", caller.organizationId);
      if (error) throw error;

      return {
        result: { ok: true as const },
        audit: {
          action: "time_entry.shift_update",
          entity: "time_entry",
          entityId: data.id,
          meta: {
            reason: "Wochenplan inline edit",
            before: {
              startedAt: before.started_at,
              endedAt: before.ended_at,
              businessDate: before.business_date,
            },
            after: {
              startedAt: data.startedAt,
              endedAt: data.endedAt,
              businessDate: newBusinessDate,
            },
          },
        },
      };
    });
  });

export const createTimeEntryShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        staffId: z.string().uuid(),
        locationId: z.string().uuid(),
        startedAt: z.string().datetime(),
        endedAt: z.string().datetime(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      if (new Date(data.endedAt).getTime() <= new Date(data.startedAt).getTime()) {
        throw new Error("Ende muss nach dem Beginn liegen.");
      }
      const businessDate = businessDateOf(new Date(data.startedAt));
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await assertBusinessDateUnlocked(supabaseAdmin, caller.organizationId, businessDate);

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
          location_id: data.locationId,
          started_at: data.startedAt,
          ended_at: data.endedAt,
          business_date: businessDate,
          break_minutes: 0,
          source: "manual",
        })
        .select("id")
        .single();
      if (error) throw error;

      return {
        result: { id: created.id },
        audit: {
          action: "time_entry.shift_create",
          entity: "time_entry",
          entityId: created.id,
          meta: {
            reason: "Wochenplan inline create",
            staffId: data.staffId,
            locationId: data.locationId,
            businessDate,
            startedAt: data.startedAt,
            endedAt: data.endedAt,
          },
        },
      };
    });
  });

// =========================================================================
// B7 — Periodenverwaltung (26.–25.)
// =========================================================================

export const listPeriods = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("periods")
      .select("id, label, start_date, end_date, status")
      .eq("organization_id", caller.organizationId)
      .order("start_date", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((p) => ({
      id: p.id as string,
      label: p.label as string,
      startDate: p.start_date as string,
      endDate: p.end_date as string,
      status: p.status as "open" | "locked",
    }));
  });

export const createPeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        label: z.string().trim().min(1).max(80),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      if (data.endDate < data.startDate) {
        throw new Error("Enddatum muss ≥ Startdatum sein.");
      }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // Overlap-Check
      const { data: overlap, error: oErr } = await supabaseAdmin
        .from("periods")
        .select("id, label, start_date, end_date")
        .eq("organization_id", caller.organizationId)
        .lte("start_date", data.endDate)
        .gte("end_date", data.startDate)
        .limit(1);
      if (oErr) throw oErr;
      if (overlap && overlap.length > 0) {
        throw new Error(
          `Überschneidet sich mit „${overlap[0].label}" (${overlap[0].start_date}–${overlap[0].end_date}).`,
        );
      }
      const { data: created, error } = await supabaseAdmin
        .from("periods")
        .insert({
          organization_id: caller.organizationId,
          label: data.label,
          start_date: data.startDate,
          end_date: data.endDate,
        })
        .select("id")
        .single();
      if (error) throw error;
      return {
        result: { id: created.id as string },
        audit: {
          action: "period.create",
          entity: "period",
          entityId: created.id as string,
          meta: { label: data.label, startDate: data.startDate, endDate: data.endDate },
        },
      };
    });
  });

export const togglePeriodLock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: row, error: loadErr } = await supabaseAdmin
        .from("periods")
        .select("id, status, label")
        .eq("id", data.id)
        .eq("organization_id", caller.organizationId)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!row) throw new Error("Periode nicht gefunden.");
      const next = row.status === "locked" ? "open" : "locked";
      const { error } = await supabaseAdmin
        .from("periods")
        .update({ status: next })
        .eq("id", data.id)
        .eq("organization_id", caller.organizationId);
      if (error) throw error;
      return {
        result: { id: data.id, status: next as "open" | "locked" },
        audit: {
          action: next === "locked" ? "period.lock" : "period.unlock",
          entity: "period",
          entityId: data.id,
          meta: { label: row.label, before: row.status, after: next },
        },
      };
    });
  });

export const deletePeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: row, error: loadErr } = await supabaseAdmin
        .from("periods")
        .select("id, status, label, start_date, end_date")
        .eq("id", data.id)
        .eq("organization_id", caller.organizationId)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!row) throw new Error("Periode nicht gefunden.");
      if (row.status !== "open") {
        throw new Error("Nur offene Perioden können gelöscht werden.");
      }
      const { error } = await supabaseAdmin
        .from("periods")
        .delete()
        .eq("id", data.id)
        .eq("organization_id", caller.organizationId);
      if (error) throw error;
      return {
        result: { ok: true as const },
        audit: {
          action: "period.delete",
          entity: "period",
          entityId: data.id,
          meta: {
            label: row.label,
            startDate: row.start_date,
            endDate: row.end_date,
          },
        },
      };
    });
  });
