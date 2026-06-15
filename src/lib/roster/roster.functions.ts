// D1 — Dienstplan (Vorausplanung). Nur Lese-Functions in diesem Schritt.
// Schreiben kommt in D2; RLS auf roster_shifts ist SELECT-only für authenticated.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { runGuarded } from "@/lib/admin/admin-call";
import { writeAuditLog } from "@/lib/admin/audit";

const READ_ROLES = ["manager", "admin", "payroll", "staff"] as const;
const WRITE_ROLES = ["manager", "admin"] as const;

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

async function assertShiftDateUnlocked(
  admin: import("@supabase/supabase-js").SupabaseClient<
    import("@/integrations/supabase/types").Database
  >,
  organizationId: string,
  shiftDate: string,
): Promise<void> {
  const { data, error } = await admin
    .from("periods")
    .select("status")
    .eq("organization_id", organizationId)
    .lte("start_date", shiftDate)
    .gte("end_date", shiftDate)
    .maybeSingle();
  if (error) throw error;
  if (data?.status === "locked") {
    throw new Error("Periode gesperrt");
  }
}

export type RosterShift = {
  id: string;
  staffId: string;
  staffName: string;
  locationId: string;
  shiftDate: string;
  area: "kitchen" | "service" | "gl";
  skillId: string | null;
  skillName: string | null;
  skillColor: string | null;
  status: "planned" | "confirmed";
  notes: string | null;
};

export type RosterSkill = {
  id: string;
  name: string;
  color: string | null;
  category: "kitchen" | "service" | "gl" | "other";
  sortOrder: number;
};

export type RosterStaffRow = {
  staffId: string;
  displayName: string;
  department: "kitchen" | "service";
  skillIds: string[];
};

export type RosterCrossBooking = {
  staffId: string;
  shiftDate: string;
  locationId: string;
  locationName: string;
  area: "kitchen" | "service" | "gl";
  skillName: string | null;
};

export type RosterAvailability = {
  staffId: string;
  date: string;
};

export type RosterAbsence = {
  staffId: string;
  date: string;
  type: "urlaub" | "krank";
};

export const getRosterShifts = createServerFn({ method: "GET" })
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
  .handler(async ({ data, context }): Promise<RosterShift[]> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, READ_ROLES);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("roster_shifts")
      .select(
        "id, staff_id, location_id, shift_date, area, skill_id, status, notes, staff(display_name), skills(name, color)",
      )
      .eq("organization_id", caller.organizationId)
      .eq("location_id", data.locationId)
      .gte("shift_date", data.fromDate)
      .lte("shift_date", data.toDate);
    if (error) throw error;
    return (rows ?? []).map((r) => ({
      id: r.id as string,
      staffId: r.staff_id as string,
      staffName: (r.staff as { display_name: string } | null)?.display_name ?? "—",
      locationId: r.location_id as string,
      shiftDate: r.shift_date as string,
      area: r.area as "kitchen" | "service" | "gl",
      skillId: (r.skill_id as string | null) ?? null,
      skillName: (r.skills as { name: string } | null)?.name ?? null,
      skillColor: (r.skills as { color: string | null } | null)?.color ?? null,
      status: r.status as "planned" | "confirmed",
      notes: (r.notes as string | null) ?? null,
    }));
  });

export const listSkills = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RosterSkill[]> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, READ_ROLES);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("skills")
      .select("id, name, color, category, sort_order")
      .eq("organization_id", caller.organizationId)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((s) => ({
      id: s.id as string,
      name: s.name as string,
      color: (s.color as string | null) ?? null,
      category: s.category as RosterSkill["category"],
      sortOrder: s.sort_order as number,
    }));
  });

export const getStaffForRoster = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ locationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<RosterStaffRow[]> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, READ_ROLES);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("staff_locations")
      .select("staff_id, department, staff(id, display_name, is_active)")
      .eq("organization_id", caller.organizationId)
      .eq("location_id", data.locationId);
    if (error) throw error;

    const staffIds = Array.from(
      new Set(
        (rows ?? [])
          .map((r) => r.staff_id as string)
          .filter((id) => {
            const s = (rows ?? []).find((x) => x.staff_id === id)?.staff as {
              is_active: boolean;
            } | null;
            return s?.is_active !== false;
          }),
      ),
    );

    const { data: skillsRows, error: sErr } = await supabaseAdmin
      .from("staff_skills")
      .select("staff_id, skill_id")
      .eq("organization_id", caller.organizationId)
      .in("staff_id", staffIds.length > 0 ? staffIds : ["00000000-0000-0000-0000-000000000000"]);
    if (sErr) throw sErr;
    const skillsByStaff = new Map<string, string[]>();
    for (const sr of skillsRows ?? []) {
      const k = sr.staff_id as string;
      const arr = skillsByStaff.get(k) ?? [];
      arr.push(sr.skill_id as string);
      skillsByStaff.set(k, arr);
    }

    return (rows ?? [])
      .filter((r) => {
        const s = r.staff as { is_active: boolean } | null;
        return s?.is_active !== false;
      })
      .map((r) => ({
        staffId: r.staff_id as string,
        displayName: (r.staff as { display_name: string } | null)?.display_name ?? "—",
        department:
          (r.department as "kitchen" | "service" | "gl") === "kitchen"
            ? ("kitchen" as const)
            : ("service" as const),
        skillIds: skillsByStaff.get(r.staff_id as string) ?? [],
      }))
      .filter((row, idx, arr) => {
        // Dedupe auf (staffId, mappedArea): gl+service desselben Mitarbeiters → 1 Service-Zeile
        return (
          arr.findIndex((x) => x.staffId === row.staffId && x.department === row.department) === idx
        );
      })
      .sort((a, b) => {
        const order = { kitchen: 0, service: 1 } as const;
        if (order[a.department] !== order[b.department]) {
          return order[a.department] - order[b.department];
        }
        return a.displayName.localeCompare(b.displayName, "de");
      });
  });

export const getStaffCrossBookings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<RosterCrossBooking[]> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, READ_ROLES);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("roster_shifts")
      .select("staff_id, shift_date, location_id, area, locations(name), skills(name)")
      .eq("organization_id", caller.organizationId)
      .gte("shift_date", data.fromDate)
      .lte("shift_date", data.toDate);
    if (error) throw error;
    return (rows ?? []).map((r) => ({
      staffId: r.staff_id as string,
      shiftDate: r.shift_date as string,
      locationId: r.location_id as string,
      locationName: (r.locations as { name: string } | null)?.name ?? "—",
      area: r.area as "kitchen" | "service" | "gl",
      skillName: (r.skills as { name: string } | null)?.name ?? null,
    }));
  });

// =========================================================================
// D2a — Schreiben (Manager+)
// =========================================================================

export const createRosterShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        locationId: z.string().uuid(),
        staffId: z.string().uuid(),
        shiftDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        area: z.enum(["kitchen", "service", "gl"]),
        skillId: z.string().uuid().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, WRITE_ROLES);
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await assertShiftDateUnlocked(supabaseAdmin, caller.organizationId, data.shiftDate);

      const { data: row, error } = await supabaseAdmin
        .from("roster_shifts")
        .upsert(
          {
            organization_id: caller.organizationId,
            location_id: data.locationId,
            staff_id: data.staffId,
            shift_date: data.shiftDate,
            area: data.area,
            skill_id: data.skillId,
            status: "planned",
          },
          { onConflict: "staff_id,location_id,shift_date,area" },
        )
        .select("id")
        .single();
      if (error) throw error;

      return {
        result: { id: row.id as string },
        audit: {
          action: "roster_shift.create",
          entity: "roster_shift",
          entityId: row.id as string,
          meta: {
            locationId: data.locationId,
            staffId: data.staffId,
            shiftDate: data.shiftDate,
            area: data.area,
            skillId: data.skillId,
          },
        },
      };
    });
  });

export const deleteRosterShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, WRITE_ROLES);
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: snap, error: loadErr } = await supabaseAdmin
        .from("roster_shifts")
        .select("*")
        .eq("id", data.id)
        .eq("organization_id", caller.organizationId)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!snap) throw new Error("Schicht nicht gefunden.");

      await assertShiftDateUnlocked(supabaseAdmin, caller.organizationId, snap.shift_date);

      const { error } = await supabaseAdmin
        .from("roster_shifts")
        .delete()
        .eq("id", data.id)
        .eq("organization_id", caller.organizationId);
      if (error) throw error;

      return {
        result: { ok: true as const },
        audit: {
          action: "roster_shift.delete",
          entity: "roster_shift",
          entityId: data.id,
          meta: {
            snapshot: {
              locationId: snap.location_id,
              staffId: snap.staff_id,
              shiftDate: snap.shift_date,
              area: snap.area,
              skillId: snap.skill_id,
              status: snap.status,
              notes: snap.notes,
            },
          },
        },
      };
    });
  });

export const updateRosterShiftStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["planned", "confirmed"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, WRITE_ROLES);
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: snap, error: loadErr } = await supabaseAdmin
        .from("roster_shifts")
        .select("shift_date, status")
        .eq("id", data.id)
        .eq("organization_id", caller.organizationId)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!snap) throw new Error("Schicht nicht gefunden.");
      await assertShiftDateUnlocked(supabaseAdmin, caller.organizationId, snap.shift_date);

      const { error } = await supabaseAdmin
        .from("roster_shifts")
        .update({ status: data.status })
        .eq("id", data.id)
        .eq("organization_id", caller.organizationId);
      if (error) throw error;

      return {
        result: { ok: true as const },
        audit: {
          action: "roster_shift.status",
          entity: "roster_shift",
          entityId: data.id,
          meta: { before: snap.status, after: data.status },
        },
      };
    });
  });

export const updateRosterShiftSkill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        skillId: z.string().uuid().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, WRITE_ROLES);
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: snap, error: loadErr } = await supabaseAdmin
        .from("roster_shifts")
        .select("shift_date, skill_id")
        .eq("id", data.id)
        .eq("organization_id", caller.organizationId)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!snap) throw new Error("Schicht nicht gefunden.");
      await assertShiftDateUnlocked(supabaseAdmin, caller.organizationId, snap.shift_date);

      const { error } = await supabaseAdmin
        .from("roster_shifts")
        .update({ skill_id: data.skillId })
        .eq("id", data.id)
        .eq("organization_id", caller.organizationId);
      if (error) throw error;

      return {
        result: { ok: true as const },
        audit: {
          action: "roster_shift.skill",
          entity: "roster_shift",
          entityId: data.id,
          meta: { before: snap.skill_id, after: data.skillId },
        },
      };
    });
  });

// D2f — Schicht verschieben (Drag & Drop). Lock-Check auf BEIDEN Daten.
// Kollisions-Pre-Check liefert eine Klartext-Fehlermeldung statt
// Unique-Violation aus der DB.
export const moveRosterShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        staffId: z.string().uuid(),
        shiftDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        area: z.enum(["kitchen", "service", "gl"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, WRITE_ROLES);
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: snap, error: loadErr } = await supabaseAdmin
        .from("roster_shifts")
        .select("location_id, staff_id, shift_date, area, skill_id, status")
        .eq("id", data.id)
        .eq("organization_id", caller.organizationId)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!snap) throw new Error("Schicht nicht gefunden.");

      // No-op guard: nichts ändert sich.
      if (
        snap.staff_id === data.staffId &&
        snap.shift_date === data.shiftDate &&
        snap.area === data.area
      ) {
        return {
          result: { ok: true as const },
          audit: {
            action: "roster_shift.move",
            entity: "roster_shift",
            entityId: data.id,
            meta: { noop: true },
          },
        };
      }

      // Lock-Check auf alte UND neue shift_date.
      await assertShiftDateUnlocked(supabaseAdmin, caller.organizationId, snap.shift_date);
      if (snap.shift_date !== data.shiftDate) {
        await assertShiftDateUnlocked(supabaseAdmin, caller.organizationId, data.shiftDate);
      }

      // Konflikt-Pre-Check auf Zielzelle.
      const { data: clash, error: clashErr } = await supabaseAdmin
        .from("roster_shifts")
        .select("id")
        .eq("organization_id", caller.organizationId)
        .eq("location_id", snap.location_id)
        .eq("staff_id", data.staffId)
        .eq("shift_date", data.shiftDate)
        .eq("area", data.area)
        .neq("id", data.id)
        .maybeSingle();
      if (clashErr) throw clashErr;
      if (clash) {
        throw new Error("Mitarbeiter ist an diesem Tag in diesem Bereich bereits eingeteilt.");
      }

      const { error } = await supabaseAdmin
        .from("roster_shifts")
        .update({
          staff_id: data.staffId,
          shift_date: data.shiftDate,
          area: data.area,
        })
        .eq("id", data.id)
        .eq("organization_id", caller.organizationId);
      if (error) throw error;

      return {
        result: { ok: true as const },
        audit: {
          action: "roster_shift.move",
          entity: "roster_shift",
          entityId: data.id,
          meta: {
            before: {
              staffId: snap.staff_id,
              shiftDate: snap.shift_date,
              area: snap.area,
            },
            after: {
              staffId: data.staffId,
              shiftDate: data.shiftDate,
              area: data.area,
            },
          },
        },
      };
    });
  });

// =========================================================================
// D2f — Verfügbarkeiten (mitarbeiterweit, ohne Standortbezug)
// =========================================================================

export const getAvailability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<RosterAvailability[]> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, READ_ROLES);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("roster_availability")
      .select("staff_id, date")
      .eq("organization_id", caller.organizationId)
      .gte("date", data.fromDate)
      .lte("date", data.toDate);
    if (error) throw error;
    return (rows ?? []).map((r) => ({
      staffId: r.staff_id as string,
      date: r.date as string,
    }));
  });

export const setUnavailable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        staffId: z.string().uuid(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, WRITE_ROLES);
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.from("roster_availability").upsert(
        {
          organization_id: caller.organizationId,
          staff_id: data.staffId,
          date: data.date,
          type: "unavailable",
        },
        { onConflict: "staff_id,date", ignoreDuplicates: true },
      );
      if (error) throw error;
      return {
        result: { ok: true as const },
        audit: {
          action: "roster_availability.set",
          entity: "roster_availability",
          meta: { staffId: data.staffId, date: data.date, type: "unavailable" },
        },
      };
    });
  });

export const clearUnavailable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        staffId: z.string().uuid(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, WRITE_ROLES);
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin
        .from("roster_availability")
        .delete()
        .eq("organization_id", caller.organizationId)
        .eq("staff_id", data.staffId)
        .eq("date", data.date);
      if (error) throw error;
      return {
        result: { ok: true as const },
        audit: {
          action: "roster_availability.clear",
          entity: "roster_availability",
          meta: { staffId: data.staffId, date: data.date },
        },
      };
    });
  });

// =========================================================================
// D2g — Urlaub / Abwesenheit (mitarbeiterweit)
// =========================================================================

export const getAbsences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<RosterAbsence[]> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, READ_ROLES);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("roster_absence")
      .select("staff_id, date, type")
      .eq("organization_id", caller.organizationId)
      .gte("date", data.fromDate)
      .lte("date", data.toDate);
    if (error) throw error;
    return (rows ?? []).map((r) => ({
      staffId: r.staff_id as string,
      date: r.date as string,
      type: ((r.type as "urlaub" | "krank") ?? "urlaub") as "urlaub" | "krank",
    }));
  });

export const setAbsence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        staffId: z.string().uuid(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        type: z.enum(["urlaub", "krank"]).optional().default("urlaub"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, WRITE_ROLES);
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.from("roster_absence").upsert(
        {
          organization_id: caller.organizationId,
          staff_id: data.staffId,
          date: data.date,
          type: data.type,
        },
        { onConflict: "staff_id,date" },
      );
      if (error) throw error;
      return {
        result: { ok: true as const },
        audit: {
          action: "roster_absence.set",
          entity: "roster_absence",
          meta: { staffId: data.staffId, date: data.date, type: data.type },
        },
      };
    });
  });

export const clearAbsence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        staffId: z.string().uuid(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, WRITE_ROLES);
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin
        .from("roster_absence")
        .delete()
        .eq("organization_id", caller.organizationId)
        .eq("staff_id", data.staffId)
        .eq("date", data.date);
      if (error) throw error;
      return {
        result: { ok: true as const },
        audit: {
          action: "roster_absence.clear",
          entity: "roster_absence",
          meta: { staffId: data.staffId, date: data.date },
        },
      };
    });
  });

function expandDateRange(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  const start = new Date(`${fromIso}T00:00:00Z`);
  const end = new Date(`${toIso}T00:00:00Z`);
  for (let d = new Date(start); d.getTime() <= end.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export const setAbsenceRange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        staffId: z.string().uuid(),
        fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        type: z.enum(["urlaub", "krank"]),
      })
      .refine((v) => v.toDate >= v.fromDate, { message: "toDate muss >= fromDate sein" })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, WRITE_ROLES);
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      const days = expandDateRange(data.fromDate, data.toDate);
      if (days.length > 92) {
        throw new Error("Zeitraum darf maximal 92 Tage umfassen.");
      }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const rows = days.map((d) => ({
        organization_id: caller.organizationId,
        staff_id: data.staffId,
        date: d,
        type: data.type,
      }));
      const { error: upErr } = await supabaseAdmin
        .from("roster_absence")
        .upsert(rows, { onConflict: "staff_id,date" });
      if (upErr) throw upErr;

      const { data: deleted, error: delErr } = await supabaseAdmin
        .from("roster_shifts")
        .delete()
        .eq("organization_id", caller.organizationId)
        .eq("staff_id", data.staffId)
        .gte("shift_date", data.fromDate)
        .lte("shift_date", data.toDate)
        .select("id");
      if (delErr) throw delErr;
      const deletedShiftCount = deleted?.length ?? 0;

      return {
        result: { ok: true as const, daysCount: days.length, deletedShiftCount },
        audit: {
          action: "roster_absence.set_range",
          entity: "roster_absence",
          meta: {
            staffId: data.staffId,
            fromDate: data.fromDate,
            toDate: data.toDate,
            type: data.type,
            daysCount: days.length,
            deletedShiftCount,
          },
        },
      };
    });
  });
