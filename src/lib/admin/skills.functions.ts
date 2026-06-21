// Server-Functions für Skills-Stammdaten und Mitarbeiter-Skill-Zuordnung.
//
// `listSkills` und `getStaffSkills` sind Lese-Functions (manager+);
// `assignStaffSkills` schreibt `staff_skills` analog zu `assignStaffLocations`
// (DELETE + INSERT in einem Vorgang, durch `runGuarded` mit Audit-Log).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "./admin-context";
import { runGuarded } from "./admin-call";
import { writeAuditLog } from "./audit";
import { distinctDepartments, ineligibleSkills, type StaffDepartment } from "./skill-eligibility";
import type { SkillCategory } from "@/lib/staff-domain";

export const listSkills = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("skills")
      .select("id, name, category, color, sort_order")
      .eq("organization_id", caller.organizationId)
      .order("sort_order")
      .order("name");
    if (error) throw error;
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
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("staff_skills")
      .select("skill_id")
      .eq("staff_id", data.staffId)
      .eq("organization_id", caller.organizationId);
    if (error) throw error;
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

        if (data.skillIds.length > 0) {
          // Eligibility-Check vor dem Schreiben: keine Skills ohne passende Abteilung.
          const [{ data: locRows, error: locErr }, { data: skillRows, error: skillErr }] =
            await Promise.all([
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
          if (locErr) throw locErr;
          if (skillErr) throw skillErr;
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

        const { error: delErr } = await supabaseAdmin
          .from("staff_skills")
          .delete()
          .eq("staff_id", data.staffId)
          .eq("organization_id", caller.organizationId);
        if (delErr) throw delErr;
        if (data.skillIds.length > 0) {
          const { error: insErr } = await supabaseAdmin.from("staff_skills").insert(
            data.skillIds.map((sid) => ({
              staff_id: data.staffId,
              organization_id: caller.organizationId,
              skill_id: sid,
            })),
          );
          if (insErr) throw insErr;
        }
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
        const { error } = await supabaseAdmin
          .from("skills")
          .update({ color: data.color })
          .eq("id", data.skillId)
          .eq("organization_id", caller.organizationId);
        if (error) throw error;
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
