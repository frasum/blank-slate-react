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
import { makeAuditWriter } from "./audit";
import { wouldRemoveLastActiveAdmin, type AdminSnapshotEntry } from "./last-admin-rule";
import type { AppRole } from "./role-guard";
import { assertStaffInOrg } from "./org-guards";
import {
  distinctDepartments,
  ineligibleSkills,
  type StaffDepartment,
  type SkillCategory,
} from "./skill-eligibility";

async function assertLocationInOrg(locationId: string, organizationId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    // ST1: bewusst ungefiltert — Daten-Zugriff (assertLocationInOrg by id).
    .from("locations")
    .select("id")
    .eq("id", locationId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Standort nicht in dieser Organisation.");
}

const DEPARTMENT_LABEL: Record<StaffDepartment, string> = {
  kitchen: "Küche",
  service: "Service",
  gl: "Geschäftsleitung",
};

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
        // SD1 — email/phone bewusst NICHT im Select: listStaff ist manager-lesbar,
        // Kontaktdaten sind Personalverwaltung (admin/payroll) und werden über
        // getStaff bereitgestellt.
        "id, first_name, last_name, display_name, is_active, role_assignments(role), staff_locations(location_id, department), staff_skills(skill_id, skills(category)), staff_pins(id)",
      )
      .eq("organization_id", caller.organizationId)
      .order("display_name");
    if (error) throw error;
    const staffIds = (data ?? []).map((s) => s.id);
    const startDates = new Map<string, string | null>();
    const birthDates = new Map<string, string | null>();
    if (staffIds.length > 0) {
      const { data: details, error: dErr } = await supabaseAdmin
        .from("staff_personal_details")
        .select("staff_id, employment_start_date, date_of_birth")
        .in("staff_id", staffIds);
      if (dErr) throw dErr;
      for (const d of details ?? []) {
        startDates.set(d.staff_id as string, (d.employment_start_date as string | null) ?? null);
        birthDates.set(d.staff_id as string, (d.date_of_birth as string | null) ?? null);
      }
    }
    return (data ?? []).map((s) => {
      const ra = s.role_assignments as { role: AppRole }[] | null;
      const role = ra && ra.length > 0 ? ra[0].role : null;
      const locations = (s.staff_locations ?? []).map((l) => l.location_id);
      const locDeptRows = (s.staff_locations ?? []) as unknown as {
        location_id: string;
        department: StaffDepartment;
      }[];
      const locationDepartments = locDeptRows.map((r) => ({
        locationId: r.location_id,
        department: r.department,
      }));
      const departments = distinctDepartments(locDeptRows);
      const skillRows = (s.staff_skills ?? []) as unknown as {
        skill_id: string;
        skills: { category: string | null } | null;
      }[];
      const skillIds = Array.from(
        new Set(skillRows.map((r) => r.skill_id).filter((id): id is string => !!id)),
      );
      const skillCategories = Array.from(
        new Set(
          skillRows
            .map((r) => r.skills?.category ?? null)
            .filter((c): c is string => typeof c === "string" && c.length > 0),
        ),
      );
      return {
        id: s.id,
        firstName: s.first_name,
        lastName: s.last_name,
        displayName: s.display_name,
        isActive: s.is_active,
        role,
        locationIds: Array.from(new Set(locations)),
        locationDepartments,
        departments,
        skillCategories,
        skillIds,
        hasPin: s.staff_pins !== null,
        employmentStartDate: startDates.get(s.id) ?? null,
        dateOfBirth: birthDates.get(s.id) ?? null,
      };
    });
  });

export const setStaffLocationDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        staffId: z.string().uuid(),
        locationId: z.string().uuid(),
        department: z.enum(["kitchen", "service", "gl"]),
        enabled: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      await assertStaffInOrg(data.staffId, caller.organizationId);
      await assertLocationInOrg(data.locationId, caller.organizationId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      if (data.enabled) {
        const { error } = await supabaseAdmin.from("staff_locations").upsert(
          {
            staff_id: data.staffId,
            organization_id: caller.organizationId,
            location_id: data.locationId,
            department: data.department,
          },
          { onConflict: "staff_id,location_id,department", ignoreDuplicates: true },
        );
        if (error) throw error;
      } else {
        // Regel a: Entzug nur, wenn dadurch kein gehaltener Skill seine Grundlage verliert.
        const { data: locRows, error: locErr } = await supabaseAdmin
          .from("staff_locations")
          .select("location_id, department")
          .eq("staff_id", data.staffId)
          .eq("organization_id", caller.organizationId);
        if (locErr) throw locErr;
        const rowsAfter = (locRows ?? []).filter(
          (r) => !(r.location_id === data.locationId && r.department === data.department),
        ) as { location_id: string; department: StaffDepartment }[];
        const departmentsAfter = distinctDepartments(rowsAfter);

        const { data: skillRows, error: skillErr } = await supabaseAdmin
          .from("staff_skills")
          .select("skill_id, skills(name, category)")
          .eq("staff_id", data.staffId)
          .eq("organization_id", caller.organizationId);
        if (skillErr) throw skillErr;
        const held = (skillRows ?? [])
          .map((r) => {
            const sk = r.skills as { name: string | null; category: string | null } | null;
            if (!sk || !sk.category) return null;
            return { name: sk.name ?? "", category: sk.category as SkillCategory };
          })
          .filter((s): s is { name: string; category: SkillCategory } => s !== null);
        const blocking = ineligibleSkills(held, departmentsAfter);
        if (blocking.length > 0) {
          throw new Error(
            `Abteilung „${DEPARTMENT_LABEL[data.department]}“ kann nicht entfernt werden — benötigt von: ${blocking
              .map((s) => s.name)
              .join(", ")}. Erst diese Skills entfernen.`,
          );
        }

        const { error: delErr } = await supabaseAdmin
          .from("staff_locations")
          .delete()
          .eq("staff_id", data.staffId)
          .eq("organization_id", caller.organizationId)
          .eq("location_id", data.locationId)
          .eq("department", data.department);
        if (delErr) throw delErr;
      }

      return {
        result: { ok: true as const },
        audit: {
          action: "staff.set_location_department",
          entity: "staff",
          entityId: data.staffId,
          meta: {
            locationId: data.locationId,
            department: data.department,
            enabled: data.enabled,
          },
        },
      };
    });
  });

export const getStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ staffId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // SD1 — Personalverwaltung admin/payroll-only (Manager haben keinen Zutritt).
    const caller = await loadAdminCaller(context.supabase, context.userId, ["admin", "payroll"]);
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
        role: z.enum(["admin", "manager", "planer", "staff", "payroll"]).nullable(),
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
      await assertStaffInOrg(data.staffId, caller.organizationId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: rpcErr } = await supabaseAdmin.rpc("replace_staff_role", {
        p_staff_id: data.staffId,
        p_organization_id: caller.organizationId,
        // RPC akzeptiert NULL = Rolle entfernen; generierter Typ ist nicht-nullbar.
        p_role: data.role as AppRole,
      });
      if (rpcErr) throw rpcErr;
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
      const { error: rpcErr } = await supabaseAdmin.rpc("replace_staff_locations", {
        p_staff_id: data.staffId,
        p_organization_id: caller.organizationId,
        p_location_ids: data.locationIds,
      });
      if (rpcErr) throw rpcErr;
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

export const setStaffParticipatesInPool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ staffId: z.string().uuid(), participates: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // SD1 — Einzig-Verwendung ist die Personalverwaltung; admin-only.
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin
        .from("staff")
        .update({ participates_in_pool: data.participates })
        .eq("id", data.staffId)
        .eq("organization_id", caller.organizationId);
      if (error) throw error;
      return {
        result: { ok: true as const },
        audit: {
          action: "staff.set_participates_in_pool",
          entity: "staff",
          entityId: data.staffId,
          meta: { participates: data.participates },
        },
      };
    });
  });
