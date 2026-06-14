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
  hashInput,
  type AssignmentInput,
  type SkillInput,
  type SkillsMode,
} from "./import-assignments";
import { runImportAssignmentsCore } from "./import-assignments-core";

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

    // Dry-Run: nur Plan berechnen, nichts schreiben.
    const dry = await runImportAssignmentsCore({
      admin: supabaseAdmin,
      organizationId: caller.organizationId,
      sourceSystem: data.sourceSystem,
      assignments: data.assignments as AssignmentInput[],
      skills: data.skills as SkillInput[],
      skillsMode: data.skillsMode as SkillsMode,
      mode: "dry_run",
    });
    const plan = dry.plan;
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
      const committed = await runImportAssignmentsCore({
        admin: supabaseAdmin,
        organizationId: caller.organizationId,
        sourceSystem: data.sourceSystem,
        assignments: data.assignments as AssignmentInput[],
        skills: data.skills as SkillInput[],
        skillsMode: data.skillsMode as SkillsMode,
        mode: "commit",
      });

      const inputHash = await hashInput(
        data.assignments as AssignmentInput[],
        data.skills as SkillInput[],
        data.skillsMode as SkillsMode,
      );

      return {
        result: { mode: "commit" as const, plan: committed.plan },
        audit: {
          action: "staff.import_assignments",
          entity: "staff_locations",
          meta: {
            sourceSystem: data.sourceSystem,
            skillsMode: data.skillsMode,
            staff: committed.plan.totals.staff,
            assignments: committed.plan.totals.assignments,
            skills: committed.plan.totals.skills,
            locationsAdded: committed.plan.totals.locationsAdded,
            locationsRemoved: committed.plan.totals.locationsRemoved,
            skillsAdded: committed.plan.totals.skillsAdded,
            skillsRemoved: committed.plan.totals.skillsRemoved,
            skippedCount: committed.plan.totals.skippedCount,
            inputHash,
          },
        },
      };
    });
  });