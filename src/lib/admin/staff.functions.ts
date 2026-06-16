// Stammdaten-/Personal-UI Server-Functions (B1c).
//
// Architektur: alle schreibenden Aktionen laufen durch `runGuarded` →
// Rollencheck VOR DB-Schreiben, audit_log NUR bei Erfolg. Last-Admin-
// Schutz ist eine reine Funktion (siehe last-admin-rule.ts), die VOR
// dem Schreiben gegen den aktuellen Snapshot geprüft wird.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "./admin-context";
import { runGuarded } from "./admin-call";
import { writeAuditLog } from "./audit";
import { wouldRemoveLastActiveAdmin, type AdminSnapshotEntry } from "./last-admin-rule";
import type { AppRole } from "./role-guard";

async function loadAdminSnapshot(organizationId: string): Promise<AdminSnapshotEntry[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("staff")
    .select("id, is_active, role_assignments(role)")
    .eq("organization_id", organizationId);
  if (error) throw error;
  return (data ?? []).map((row) => {
    const ra = row.role_assignments as { role: AppRole }[] | { role: AppRole } | null;
    const role = Array.isArray(ra) ? (ra[0]?.role ?? null) : (ra?.role ?? null);
    return { staffId: row.id, isActive: row.is_active, role };
  });
}

// =========================================================================
// Lesen (manager+)
// =========================================================================

export const listStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("staff")
      .select(
        "id, first_name, last_name, display_name, email, phone, is_active, role_assignments(role), staff_locations(location_id), staff_pins(id), access_tokens(id, token_type, used_at, expires_at)",
      )
      .eq("organization_id", caller.organizationId)
      .order("display_name");
    if (error) throw error;
    return (data ?? []).map((s) => {
      const ra = s.role_assignments as { role: AppRole }[] | null;
      const role = ra && ra.length > 0 ? ra[0].role : null;
      const locations = (s.staff_locations ?? []).map((l) => l.location_id);
      const activeBadges = (s.access_tokens ?? []).filter(
        (t) => t.token_type === "badge_login" && t.used_at === null,
      ).length;
      return {
        id: s.id,
        firstName: s.first_name,
        lastName: s.last_name,
        displayName: s.display_name,
        email: s.email,
        phone: s.phone,
        isActive: s.is_active,
        role,
        locationIds: locations,
        hasPin: s.staff_pins !== null,
        activeBadgeCount: activeBadges,
      };
    });
  });

export const getStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ staffId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: staff, error } = await supabaseAdmin
      .from("staff")
      .select(
        "id, organization_id, first_name, last_name, display_name, email, phone, is_active, participates_in_pool, role_assignments(role), staff_locations(location_id), staff_pins(id)",
      )
      .eq("id", data.staffId)
      .eq("organization_id", caller.organizationId)
      .maybeSingle();
    if (error) throw error;
    if (!staff) throw new Error("Mitarbeiter nicht gefunden");
    const ra = staff.role_assignments as { role: AppRole }[] | null;
    return {
      id: staff.id,
      firstName: staff.first_name,
      lastName: staff.last_name,
      displayName: staff.display_name,
      email: staff.email,
      phone: staff.phone,
      isActive: staff.is_active,
      participatesInPool: staff.participates_in_pool,
      role: (ra && ra.length > 0 ? ra[0].role : null) as AppRole | null,
      locationIds: (staff.staff_locations ?? []).map((l) => l.location_id),
      hasPin: staff.staff_pins !== null,
    };
  });

// =========================================================================
// Schreiben (admin)
// =========================================================================

const staffBasicsSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  displayName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
});

export const createStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => staffBasicsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: created, error } = await supabaseAdmin
        .from("staff")
        .insert({
          organization_id: caller.organizationId,
          first_name: data.firstName,
          last_name: data.lastName,
          display_name: data.displayName,
          email: data.email ?? null,
          phone: data.phone ?? null,
          is_active: true,
        })
        .select("id")
        .single();
      if (error) throw error;
      return {
        result: { id: created.id },
        audit: {
          action: "staff.create",
          entity: "staff",
          entityId: created.id,
          meta: { displayName: data.displayName },
        },
      };
    });
  });

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

export const updateStaffBasics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ staffId: z.string().uuid() }).merge(staffBasicsSchema).parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin
        .from("staff")
        .update({
          first_name: data.firstName,
          last_name: data.lastName,
          display_name: data.displayName,
          email: data.email ?? null,
          phone: data.phone ?? null,
        })
        .eq("id", data.staffId)
        .eq("organization_id", caller.organizationId);
      if (error) throw error;
      return {
        result: { ok: true as const },
        audit: { action: "staff.update", entity: "staff", entityId: data.staffId },
      };
    });
  });

export const setStaffActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ staffId: z.string().uuid(), isActive: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const snapshot = await loadAdminSnapshot(caller.organizationId);
      if (
        !data.isActive &&
        wouldRemoveLastActiveAdmin(snapshot, { staffId: data.staffId, nextActive: false })
      ) {
        throw new Error("Mindestens ein aktiver Admin muss erhalten bleiben.");
      }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin
        .from("staff")
        .update({ is_active: data.isActive })
        .eq("id", data.staffId)
        .eq("organization_id", caller.organizationId);
      if (error) throw error;
      return {
        result: { ok: true as const },
        audit: {
          action: data.isActive ? "staff.activate" : "staff.deactivate",
          entity: "staff",
          entityId: data.staffId,
        },
      };
    });
  });

export const setStaffRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        staffId: z.string().uuid(),
        role: z.enum(["admin", "manager", "staff", "payroll"]).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const snapshot = await loadAdminSnapshot(caller.organizationId);
      if (wouldRemoveLastActiveAdmin(snapshot, { staffId: data.staffId, nextRole: data.role })) {
        throw new Error("Mindestens ein aktiver Admin muss erhalten bleiben.");
      }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      if (data.role === null) {
        const { error } = await supabaseAdmin
          .from("role_assignments")
          .delete()
          .eq("staff_id", data.staffId)
          .eq("organization_id", caller.organizationId);
        if (error) throw error;
      } else {
        // Upsert: erst löschen, dann einfügen (eindeutige Rolle pro staff/org).
        const { error: delErr } = await supabaseAdmin
          .from("role_assignments")
          .delete()
          .eq("staff_id", data.staffId)
          .eq("organization_id", caller.organizationId);
        if (delErr) throw delErr;
        const { error: insErr } = await supabaseAdmin.from("role_assignments").insert({
          staff_id: data.staffId,
          organization_id: caller.organizationId,
          role: data.role,
        });
        if (insErr) throw insErr;
      }
      return {
        result: { ok: true as const },
        audit: {
          action: "staff.set_role",
          entity: "staff",
          entityId: data.staffId,
          meta: { role: data.role },
        },
      };
    });
  });

export const assignStaffLocations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        staffId: z.string().uuid(),
        locationIds: z.array(z.string().uuid()),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: delErr } = await supabaseAdmin
        .from("staff_locations")
        .delete()
        .eq("staff_id", data.staffId)
        .eq("organization_id", caller.organizationId);
      if (delErr) throw delErr;
      if (data.locationIds.length > 0) {
        const { error: insErr } = await supabaseAdmin.from("staff_locations").insert(
          data.locationIds.map((lid) => ({
            staff_id: data.staffId,
            organization_id: caller.organizationId,
            location_id: lid,
            department: "service" as const,
          })),
        );
        if (insErr) throw insErr;
      }
      return {
        result: { ok: true as const },
        audit: {
          action: "staff.assign_locations",
          entity: "staff",
          entityId: data.staffId,
          meta: { locationIds: data.locationIds },
        },
      };
    });
  });
