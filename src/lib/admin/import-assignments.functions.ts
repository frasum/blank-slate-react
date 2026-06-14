// Server-Function `importStaffAssignments` (Teil Y).
//
// Admin-only. Nimmt bereits geparste Listen (assignments + skills) entgegen,
// löst sie über `staff_identity_map`, die feste alt→neu Location-Map und die
// org-scoped `skills`-Tabelle auf, berechnet den Diff via reinem
// `computeAssignmentPlan` und schreibt im Commit-Pfad idempotent in
// `staff_locations` / `staff_skills`. Dry-Run schreibt nichts und schreibt
// KEIN audit_log; ein Commit mit Bilanz 0/0/0 ebenfalls nicht (Log-Hygiene).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { runGuarded } from "@/lib/admin/admin-call";
import { writeAuditLog } from "@/lib/admin/audit";
import {
  computeAssignmentPlan,
  hashInput,
  type AssignmentInput,
  type CurrentLocationRow,
  type CurrentSkillRow,
  type SkillInput,
  type SkillsMode,
} from "./import-assignments";

const ztDepartmentSchema = z.enum(["Küche", "Service", "GL"]);

const inputSchema = z.object({
  assignments: z.array(
    z.object({
      altStaffId: z.string().min(1),
      altLocationId: z.string().min(1),
      ztDepartment: ztDepartmentSchema,
    }),
  ),
  skills: z.array(
    z.object({
      altStaffId: z.string().min(1),
      skillName: z.string().min(1),
    }),
  ),
  mode: z.enum(["dry_run", "commit"]),
  sourceSystem: z.enum(["tagesabrechnung"]).default("tagesabrechnung"),
  skillsMode: z.enum(["merge", "replace"]).default("replace"),
});

export const importStaffAssignments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // --- Auflösungs-Tabellen laden (Org-scoped) ---
    // staff_identity_map: nur bestätigte Mappings.
    const { data: mapRows, error: mapErr } = await supabaseAdmin
      .from("staff_identity_map")
      .select("alt_id, staff_id, confirmed_at")
      .eq("organization_id", caller.organizationId)
      .eq("source_system", data.sourceSystem);
    if (mapErr) throw mapErr;
    const staffMap = new Map<string, string>();
    for (const r of mapRows ?? []) {
      if (!r.confirmed_at || !r.staff_id) continue;
      staffMap.set(r.alt_id, r.staff_id);
    }

    // locations: feste alt→neu Map; wir verifizieren, dass die Ziel-Locations
    // in dieser Org existieren. Unbekannte Alt-IDs fallen in skippedRows.
    const ALT_TO_LOC: Record<string, string> = {
      "a1710390-0000-0000-0000-000000000000": "44a99e7e-93be-44b1-89ab-38e364a02ddc",
      "3065f458-0000-0000-0000-000000000000": "14c2d773-6c5f-4a24-ba00-1c726f277091",
    };
    const { data: locRows, error: locErr } = await supabaseAdmin
      .from("locations")
      .select("id")
      .eq("organization_id", caller.organizationId);
    if (locErr) throw locErr;
    const validLocIds = new Set((locRows ?? []).map((r) => r.id));
    const locationMap = new Map<string, string>();
    for (const [altId, locId] of Object.entries(ALT_TO_LOC)) {
      if (validLocIds.has(locId)) locationMap.set(altId, locId);
    }

    const { data: skillRows, error: skillErr } = await supabaseAdmin
      .from("skills")
      .select("id, name")
      .eq("organization_id", caller.organizationId);
    if (skillErr) throw skillErr;
    const skillMap = new Map<string, string>();
    for (const r of skillRows ?? []) skillMap.set(r.name, r.id);

    // Ist-Zustand laden — nur betroffene Mitarbeiter.
    const staffIds = Array.from(new Set(Array.from(staffMap.values())));
    let currentLocations: CurrentLocationRow[] = [];
    let currentSkills: CurrentSkillRow[] = [];
    if (staffIds.length > 0) {
      const { data: slRows, error: slErr } = await supabaseAdmin
        .from("staff_locations")
        .select("staff_id, location_id, department")
        .eq("organization_id", caller.organizationId)
        .in("staff_id", staffIds);
      if (slErr) throw slErr;
      currentLocations = (slRows ?? []).map((r) => ({
        staffId: r.staff_id,
        locationId: r.location_id,
        department: r.department,
      }));

      const { data: ssRows, error: ssErr } = await supabaseAdmin
        .from("staff_skills")
        .select("staff_id, skill_id")
        .eq("organization_id", caller.organizationId)
        .in("staff_id", staffIds);
      if (ssErr) throw ssErr;
      currentSkills = (ssRows ?? []).map((r) => ({
        staffId: r.staff_id,
        skillId: r.skill_id,
      }));
    }

    const plan = computeAssignmentPlan({
      assignments: data.assignments as AssignmentInput[],
      skills: data.skills as SkillInput[],
      staffMap,
      locationMap,
      skillMap,
      currentLocations,
      currentSkills,
      skillsMode: data.skillsMode as SkillsMode,
    });

    if (data.mode === "dry_run") {
      return { mode: "dry_run" as const, plan };
    }

    // --- Commit-Pfad ---
    const writeAudit = async (entry: {
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

    const noChanges =
      plan.totals.locationsAdded === 0 &&
      plan.totals.locationsRemoved === 0 &&
      plan.totals.skillsAdded === 0 &&
      plan.totals.skillsRemoved === 0;

    // Bei 0/0/0: ohne runGuarded laufen (Rolle wurde bereits oben geprüft),
    // aber kein Audit-Eintrag schreiben.
    if (noChanges) {
      return { mode: "commit" as const, plan };
    }

    return runGuarded(caller.role, "admin", writeAudit, async () => {
      // Locations: Adds zuerst, dann Removes (vermeidet Unique-Reibung).
      const adds = plan.locationOps.filter((o) => o.op === "add");
      if (adds.length > 0) {
        const { error: addErr } = await supabaseAdmin.from("staff_locations").insert(
          adds.map((o) => ({
            organization_id: caller.organizationId,
            staff_id: o.staffId,
            location_id: o.locationId,
            department: o.department,
          })),
        );
        if (addErr) throw new Error(`staff_locations insert failed: ${addErr.message}`);
      }
      for (const o of plan.locationOps) {
        if (o.op !== "remove") continue;
        const { error: rmErr } = await supabaseAdmin
          .from("staff_locations")
          .delete()
          .eq("organization_id", caller.organizationId)
          .eq("staff_id", o.staffId)
          .eq("location_id", o.locationId)
          .eq("department", o.department);
        if (rmErr) throw new Error(`staff_locations delete failed: ${rmErr.message}`);
      }

      // Skills
      const skillAdds = plan.skillOps.filter((o) => o.op === "add");
      if (skillAdds.length > 0) {
        const { error: addErr } = await supabaseAdmin.from("staff_skills").insert(
          skillAdds.map((o) => ({
            organization_id: caller.organizationId,
            staff_id: o.staffId,
            skill_id: o.skillId,
          })),
        );
        if (addErr) throw new Error(`staff_skills insert failed: ${addErr.message}`);
      }
      for (const o of plan.skillOps) {
        if (o.op !== "remove") continue;
        const { error: rmErr } = await supabaseAdmin
          .from("staff_skills")
          .delete()
          .eq("organization_id", caller.organizationId)
          .eq("staff_id", o.staffId)
          .eq("skill_id", o.skillId);
        if (rmErr) throw new Error(`staff_skills delete failed: ${rmErr.message}`);
      }

      const inputHash = await hashInput(
        data.assignments as AssignmentInput[],
        data.skills as SkillInput[],
        data.skillsMode as SkillsMode,
      );

      return {
        result: { mode: "commit" as const, plan },
        audit: {
          action: "staff.import_assignments",
          entity: "staff_locations",
          meta: {
            sourceSystem: data.sourceSystem,
            skillsMode: data.skillsMode,
            staff: plan.totals.staff,
            assignments: plan.totals.assignments,
            skills: plan.totals.skills,
            locationsAdded: plan.totals.locationsAdded,
            locationsRemoved: plan.totals.locationsRemoved,
            skillsAdded: plan.totals.skillsAdded,
            skillsRemoved: plan.totals.skillsRemoved,
            skippedCount: plan.totals.skippedCount,
            inputHash,
          },
        },
      };
    });
  });