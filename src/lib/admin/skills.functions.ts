// Server-Functions für Skills-Stammdaten und Mitarbeiter-Skill-Zuordnung.
//
// `listSkills` und `getStaffSkills` sind Lese-Functions (manager+);
// `assignStaffSkills` schreibt `staff_skills` per DELETE + INSERT in einem
// Vorgang, durch `runGuarded` mit Audit-Log.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "./admin-context";
import { runAllowed, runGuarded } from "./admin-call";
import { writeAuditLog } from "./audit";
import { distinctDepartments, ineligibleSkills, type StaffDepartment } from "./skill-eligibility";
import type { SkillCategory } from "@/lib/staff-domain";
import { expectOk, expectVoid } from "@/lib/supabase/expect-ok";
export type { SkillCategory };

export const listSkills = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, [
      "manager",
      "admin",
      "planer",
      "payroll",
    ]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const data = expectOk<
      { id: string; name: string; category: string; color: string | null; sort_order: number }[]
    >(
      await supabaseAdmin
        .from("skills")
        .select("id, name, category, color, sort_order")
        .eq("organization_id", caller.organizationId)
        .order("sort_order")
        .order("name"),
      "listSkills",
    );
    return (data ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category as SkillCategory,
      color: s.color,
      sortOrder: s.sort_order,
    }));
  });

export const getStaffSkills = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ staffId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, [
      "admin",
      "manager",
      "planer",
      "payroll",
    ]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = expectOk<{ skill_id: string }[]>(
      await supabaseAdmin
        .from("staff_skills")
        .select("skill_id")
        .eq("staff_id", data.staffId)
        .eq("organization_id", caller.organizationId),
      "getStaffSkills",
    );
    return (rows ?? []).map((r) => r.skill_id);
  });

export const assignStaffSkills = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        staffId: z.string().uuid(),
        skillIds: z.array(z.string().uuid()),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ["admin", "payroll"]);
    return runAllowed(
      caller.role,
      ["admin", "payroll"],
      async (entry) => {
        await writeAuditLog({
          organizationId: caller.organizationId,
          actorUserId: caller.userId,
          actorStaffId: caller.staffId,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          meta: entry.meta,
        });
      },
      async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        if (data.skillIds.length > 0) {
          // Eligibility-Check vor dem Schreiben: keine Skills ohne passende Abteilung.
          const [locRes, skillRes] = await Promise.all([
            supabaseAdmin
              .from("staff_locations")
              .select("department")
              .eq("staff_id", data.staffId)
              .eq("organization_id", caller.organizationId),
            supabaseAdmin
              .from("skills")
              .select("id, name, category")
              .eq("organization_id", caller.organizationId)
              .in("id", data.skillIds),
          ]);
          const locRows = expectOk<{ department: StaffDepartment }[]>(
            locRes,
            "assignStaffSkills.staff_locations",
          );
          const skillRows = expectOk<{ id: string; name: string; category: string }[]>(
            skillRes,
            "assignStaffSkills.skills",
          );
          const departments = distinctDepartments(
            (locRows ?? []) as { department: StaffDepartment }[],
          );
          const wanted = (skillRows ?? []).map((s) => ({
            id: s.id,
            name: s.name,
            category: s.category as SkillCategory,
          }));
          const bad = ineligibleSkills(wanted, departments);
          if (bad.length > 0) {
            throw new Error(
              `Skill(s) ohne passende Abteilung: ${bad.map((s) => s.name).join(", ")}`,
            );
          }
        }

        expectVoid(
          await supabaseAdmin.rpc("replace_staff_skills", {
            p_staff_id: data.staffId,
            p_organization_id: caller.organizationId,
            p_skill_ids: data.skillIds,
          }),
          "assignStaffSkills.rpc",
        );
        return {
          result: { ok: true as const },
          audit: {
            action: "staff.assign_skills",
            entity: "staff",
            entityId: data.staffId,
            meta: { skillIds: data.skillIds },
          },
        };
      },
    );
  });

export const updateSkillColor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        skillId: z.string().uuid(),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/, "Farbe muss als #RRGGBB angegeben werden.")
          .nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(
      caller.role,
      "admin",
      async (entry) => {
        await writeAuditLog({
          organizationId: caller.organizationId,
          actorUserId: caller.userId,
          actorStaffId: caller.staffId,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          meta: entry.meta,
        });
      },
      async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        expectVoid(
          await supabaseAdmin
            .from("skills")
            .update({ color: data.color })
            .eq("id", data.skillId)
            .eq("organization_id", caller.organizationId),
          "updateSkillColor.update",
        );
        return {
          result: { ok: true as const },
          audit: {
            action: "skill.update_color",
            entity: "skill",
            entityId: data.skillId,
            meta: { color: data.color },
          },
        };
      },
    );
  });
