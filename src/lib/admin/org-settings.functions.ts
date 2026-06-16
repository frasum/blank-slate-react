// Organisations-weite Einstellungen (B1c-Erweiterung).
//
// Schnitt:
//   * getOrgSettings — manager+ darf lesen (für Anzeige in /admin/einstellungen).
//   * updateOrgSettings — admin schreibt, runGuarded + audit_log.
//
// Geld-/Pool-Regeln werden hier nur transportiert; die eigentliche
// Geld-Logik (kitchen_tip_rate-Anwendung, Mindeststunden-Filter) lebt
// in src/lib/cash/*. Validierungs-Grenzen unten sind defensiv (keine
// Negativwerte, Trinkgeldsatz 0..1, Mindeststunden 0..24).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "./admin-context";
import { runGuarded } from "./admin-call";
import { writeAuditLog } from "./audit";

export type OrgSettings = {
  kitchenTipRate: number; // 0..1, z. B. 0.02
  tipPoolMinHours: number; // Tagessumme, inklusive Grenze
};

const updateSchema = z.object({
  kitchenTipRate: z.number().min(0).max(1),
  tipPoolMinHours: z.number().min(0).max(24),
});

export const getOrgSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OrgSettings> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("organization_settings")
      .select("kitchen_tip_rate, tip_pool_min_hours")
      .eq("organization_id", caller.organizationId)
      .maybeSingle();
    if (error) throw error;
    return {
      kitchenTipRate: Number(data?.kitchen_tip_rate ?? 0.02),
      tipPoolMinHours: Number(data?.tip_pool_min_hours ?? 2.5),
    };
  });

export const updateOrgSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => updateSchema.parse(input))
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
          .from("organization_settings")
          .update({
            kitchen_tip_rate: data.kitchenTipRate,
            tip_pool_min_hours: data.tipPoolMinHours,
          })
          .eq("organization_id", caller.organizationId);
        if (error) throw error;
        return {
          result: { ok: true as const },
          audit: {
            action: "org_settings.update",
            entity: "organization_settings",
            entityId: caller.organizationId,
            meta: {
              kitchenTipRate: data.kitchenTipRate,
              tipPoolMinHours: data.tipPoolMinHours,
            },
          },
        };
      },
    );
  });