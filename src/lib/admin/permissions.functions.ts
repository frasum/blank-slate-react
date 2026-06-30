// Server-Funktionen für Rechte-Verwaltung (Teil B / M2 Kasse).
//
// Schreiben ist nur dem ECHTEN Admin erlaubt (is_real_admin), damit eine
// laufende Impersonation die Rechte-Vergabe nicht aushebeln kann.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeAuditLog } from "./audit";
import { assertStaffInOrg } from "./org-guards";
import type { AppPermission, PermissionEffect } from "./permissions-catalog";
import type { StaffDepartment } from "@/lib/staff-domain";

type RoleKey = "admin" | "manager" | "staff" | "payroll" | "planer";

export type RoleDefault = { role: RoleKey; permission: AppPermission };

export type StaffOverride = {
  id: string;
  permission: AppPermission;
  effect: PermissionEffect;
  locationId: string | null;
  area: StaffDepartment | null;
  createdAt: string;
  createdBy: string | null;
};

export type StaffPermissionsResult = {
  staffId: string;
  role: RoleKey | null;
  defaults: AppPermission[];
  overrides: StaffOverride[];
};

async function assertRealAdmin(supabase: {
  rpc: (fn: string) => Promise<{ data: unknown; error: { message: string } | null }>;
}): Promise<void> {
  const { data, error } = await supabase.rpc("is_real_admin");
  if (error) throw new Error(`is_real_admin failed: ${error.message}`);
  if (data !== true) throw new Error("Forbidden");
}

export const listPermissionDefaults = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RoleDefault[]> => {
    const { data, error } = await context.supabase
      .from("permission_role_defaults")
      .select("role, permission");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      role: r.role as RoleKey,
      permission: r.permission as AppPermission,
    }));
  });

export const getStaffPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { staffId: string }) => {
    if (!input?.staffId) throw new Error("staffId fehlt");
    return input;
  })
  .handler(async ({ data, context }): Promise<StaffPermissionsResult> => {
    await assertRealAdmin(context.supabase as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: role, error: roleErr } = await supabaseAdmin
      .from("role_assignments")
      .select("role")
      .eq("staff_id", data.staffId)
      .maybeSingle();
    if (roleErr) throw new Error(roleErr.message);

    const roleKey = (role?.role ?? null) as RoleKey | null;

    const [defaultsRes, overridesRes] = await Promise.all([
      roleKey
        ? supabaseAdmin.from("permission_role_defaults").select("permission").eq("role", roleKey)
        : Promise.resolve({ data: [], error: null } as const),
      supabaseAdmin
        .from("permission_overrides")
        .select("id, permission, effect, location_id, area, created_at, created_by")
        .eq("staff_id", data.staffId)
        .order("created_at", { ascending: false }),
    ]);

    if (defaultsRes.error) throw new Error(defaultsRes.error.message);
    if (overridesRes.error) throw new Error(overridesRes.error.message);

    return {
      staffId: data.staffId,
      role: roleKey,
      defaults: (defaultsRes.data ?? []).map((r) => r.permission as AppPermission),
      overrides: (overridesRes.data ?? []).map((r) => ({
        id: r.id,
        permission: r.permission as AppPermission,
        effect: r.effect as PermissionEffect,
        locationId: r.location_id,
        area: (r.area as StaffDepartment | null) ?? null,
        createdAt: r.created_at,
        createdBy: r.created_by,
      })),
    };
  });

export const setPermissionOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      staffId: string;
      permission: AppPermission;
      effect: PermissionEffect;
      locationId: string | null;
      area: StaffDepartment | null;
    }) => {
      if (!input?.staffId) throw new Error("staffId fehlt");
      if (!input?.permission) throw new Error("permission fehlt");
      if (input.effect !== "allow" && input.effect !== "deny") throw new Error("effect ungültig");
      if (
        input.area !== null &&
        input.area !== "kitchen" &&
        input.area !== "service" &&
        input.area !== "gl"
      ) {
        throw new Error("area ungültig");
      }
      return input;
    },
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertRealAdmin(context.supabase as never);
    const { data: orgRow, error: orgErr } = await context.supabase.rpc("current_organization_id");
    if (orgErr) throw new Error(`org lookup failed: ${orgErr.message}`);
    const callerOrgId = orgRow as string | null;
    if (!callerOrgId) throw new Error("Keine Organisation für den Aufrufer.");
    await assertStaffInOrg(data.staffId, callerOrgId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: staffRow, error: staffErr } = await supabaseAdmin
      .from("staff")
      .select("id, organization_id")
      .eq("id", data.staffId)
      .maybeSingle();
    if (staffErr) throw new Error(staffErr.message);
    if (!staffRow) throw new Error("Mitarbeiter nicht gefunden");

    // Manuelles Upsert via delete+insert, weil die Unique-Indizes partial sind
    // (location_id IS NULL vs IS NOT NULL) und onConflict damit nicht funktioniert.
    const delQ = supabaseAdmin
      .from("permission_overrides")
      .delete()
      .eq("staff_id", data.staffId)
      .eq("permission", data.permission);
    const delLoc = data.locationId
      ? delQ.eq("location_id", data.locationId)
      : delQ.is("location_id", null);
    const del = await (data.area ? delLoc.eq("area", data.area) : delLoc.is("area", null));
    if (del.error) throw new Error(del.error.message);

    const { error: insErr } = await supabaseAdmin.from("permission_overrides").insert({
      organization_id: staffRow.organization_id,
      staff_id: data.staffId,
      permission: data.permission,
      effect: data.effect,
      location_id: data.locationId,
      area: data.area,
      created_by: context.userId,
    });
    if (insErr) throw new Error(insErr.message);

    await writeAuditLog({
      organizationId: staffRow.organization_id,
      actorUserId: context.userId,
      actorStaffId: null,
      action: "permissions.override_set",
      entity: "permission_overrides",
      entityId: data.staffId,
      meta: {
        permission: data.permission,
        effect: data.effect,
        location_id: data.locationId,
        area: data.area,
      },
    });
    return { ok: true };
  });

export const clearPermissionOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      staffId: string;
      permission: AppPermission;
      locationId: string | null;
      area: StaffDepartment | null;
    }) => {
      if (!input?.staffId) throw new Error("staffId fehlt");
      if (!input?.permission) throw new Error("permission fehlt");
      return input;
    },
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertRealAdmin(context.supabase as never);
    const { data: orgRow, error: orgErr } = await context.supabase.rpc("current_organization_id");
    if (orgErr) throw new Error(`org lookup failed: ${orgErr.message}`);
    const callerOrgId = orgRow as string | null;
    if (!callerOrgId) throw new Error("Keine Organisation für den Aufrufer.");
    await assertStaffInOrg(data.staffId, callerOrgId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: staffRow, error: staffErr } = await supabaseAdmin
      .from("staff")
      .select("id, organization_id")
      .eq("id", data.staffId)
      .maybeSingle();
    if (staffErr) throw new Error(staffErr.message);
    if (!staffRow) throw new Error("Mitarbeiter nicht gefunden");

    const delQ = supabaseAdmin
      .from("permission_overrides")
      .delete()
      .eq("staff_id", data.staffId)
      .eq("permission", data.permission);
    const delLoc = data.locationId
      ? delQ.eq("location_id", data.locationId)
      : delQ.is("location_id", null);
    const del = await (data.area ? delLoc.eq("area", data.area) : delLoc.is("area", null));
    if (del.error) throw new Error(del.error.message);

    await writeAuditLog({
      organizationId: staffRow.organization_id,
      actorUserId: context.userId,
      actorStaffId: null,
      action: "permissions.override_cleared",
      entity: "permission_overrides",
      entityId: data.staffId,
      meta: { permission: data.permission, location_id: data.locationId, area: data.area },
    });
    return { ok: true };
  });
