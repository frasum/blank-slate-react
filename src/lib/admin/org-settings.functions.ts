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
  kitchenManualOnly: boolean;
  testModeEnabled: boolean;
  testModeEmail: string | null;
  betriebsnummer: string | null;
  arbeitgeberName: string | null;
  arbeitgeberAdresse: string | null;
  arbeitgeberVertreter: string | null;
};

const updateSchema = z
  .object({
    kitchenTipRate: z.number().min(0).max(1),
    tipPoolMinHours: z.number().min(0).max(24),
    kitchenManualOnly: z.boolean(),
    testModeEnabled: z.boolean(),
    testModeEmail: z
      .string()
      .trim()
      .max(254)
      .email("Ungültige E-Mail-Adresse.")
      .nullable()
      .or(z.literal("").transform(() => null)),
  })
  .superRefine((v, ctx) => {
    if (v.testModeEnabled && !v.testModeEmail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["testModeEmail"],
        message: "Bei aktivem Testmodus ist eine gültige E-Mail-Adresse Pflicht.",
      });
    }
  });

export const getOrgSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OrgSettings> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("organization_settings")
      .select(
        "kitchen_tip_rate, tip_pool_min_hours, kitchen_manual_only, test_mode_enabled, test_mode_email, betriebsnummer, arbeitgeber_name, arbeitgeber_adresse, arbeitgeber_vertreter",
      )
      .eq("organization_id", caller.organizationId)
      .maybeSingle();
    if (error) throw error;
    return {
      kitchenTipRate: Number(data?.kitchen_tip_rate ?? 0.02),
      tipPoolMinHours: Number(data?.tip_pool_min_hours ?? 2.5),
      kitchenManualOnly: Boolean(data?.kitchen_manual_only ?? false),
      testModeEnabled: Boolean(data?.test_mode_enabled ?? false),
      testModeEmail: data?.test_mode_email ?? null,
      betriebsnummer: data?.betriebsnummer ?? null,
      arbeitgeberName: data?.arbeitgeber_name ?? null,
      arbeitgeberAdresse: data?.arbeitgeber_adresse ?? null,
      arbeitgeberVertreter: data?.arbeitgeber_vertreter ?? null,
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
            kitchen_manual_only: data.kitchenManualOnly,
            test_mode_enabled: data.testModeEnabled,
            test_mode_email: data.testModeEmail,
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
              kitchenManualOnly: data.kitchenManualOnly,
              testModeEnabled: data.testModeEnabled,
              testModeEmail: data.testModeEmail,
            },
          },
        };
      },
    );
  });

// Arbeitgeber-Stammdaten (V2 Dokumentengenerierung). Gleiches Muster wie
// setBetriebsnummer: admin-gated, runGuarded + Audit, Werte NICHT ins Meta
// (nur hasValue-Flags), damit z. B. Vertreter-Namen nicht ins audit_log gehen.

const stammdatenSchema = z.object({
  arbeitgeberName: z
    .string()
    .trim()
    .max(200)
    .nullable()
    .or(z.literal("").transform(() => null)),
  arbeitgeberAdresse: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .or(z.literal("").transform(() => null)),
  arbeitgeberVertreter: z
    .string()
    .trim()
    .max(200)
    .nullable()
    .or(z.literal("").transform(() => null)),
});

export const setArbeitgeberStammdaten = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => stammdatenSchema.parse(i))
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
            arbeitgeber_name: data.arbeitgeberName,
            arbeitgeber_adresse: data.arbeitgeberAdresse,
            arbeitgeber_vertreter: data.arbeitgeberVertreter,
          })
          .eq("organization_id", caller.organizationId);
        if (error) throw error;
        return {
          result: { ok: true as const },
          audit: {
            action: "settings.arbeitgeber_changed",
            entity: "organization_settings",
            entityId: caller.organizationId,
            meta: {
              hasName: !!data.arbeitgeberName,
              hasAdresse: !!data.arbeitgeberAdresse,
              hasVertreter: !!data.arbeitgeberVertreter,
            },
          },
        };
      },
    );
  });
