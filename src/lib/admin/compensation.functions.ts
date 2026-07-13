// Server-Functions für staff_compensation (Stundenlohn).
// Sichtbarkeit & Schreiben: ausschließlich admin (RLS + Code-Check).
// Payroll/Manager sehen den Stundenlohn NICHT.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "./admin-context";
import { assertPermission, runWithPermission } from "./admin-call";
import { writeAuditLog } from "./audit";
import { todayIso } from "@/lib/format";
import { expectMaybe, expectVoid } from "@/lib/supabase/expect-ok";

const staffIdInput = z.object({ staffId: z.string().uuid() });

export type CompensationDto = {
  exists: boolean;
  hourlyRate: number | null;
  validFrom: string | null;
};

const upsertInput = z.object({
  staffId: z.string().uuid(),
  hourlyRate: z
    .union([z.number(), z.null()])
    .transform((v) => (v === null ? null : v))
    .pipe(z.number().min(0).max(1000).nullable()),
  validFrom: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null(), z.undefined()])
    .optional()
    .transform((v) => (v ? v : null)),
});

// N18a (13.07.): zentrale Berlin-„Heute"-Ableitung — nachts (00:00–02:00
// MEZ) lieferte die UTC-Variante bereits den nächsten Kalendertag, was den
// Gültigkeits-Cutoff der Lohnsatz-Historie um einen Tag verrutschen ließ.
const todayISO = todayIso;

export const getStaffCompensation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => staffIdInput.parse(input))
  .handler(async ({ data, context }): Promise<CompensationDto> => {
    await assertPermission(context.supabase, "payroll.compensation.view");
    const caller = await loadAdminCaller(context.supabase, context.userId, ["admin", "payroll"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = expectMaybe<{ hourly_rate: number | string | null; valid_from: string | null }>(
      await supabaseAdmin
        .from("staff_compensation")
        .select("hourly_rate, valid_from")
        .eq("staff_id", data.staffId)
        .eq("organization_id", caller.organizationId)
        .maybeSingle(),
      "getStaffCompensation.load",
    );
    if (!row) return { exists: false, hourlyRate: null, validFrom: null };
    return {
      exists: true,
      hourlyRate: row.hourly_rate === null ? null : Number(row.hourly_rate),
      validFrom: row.valid_from,
    };
  });

export const upsertStaffCompensation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => upsertInput.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ["admin", "payroll"]);
    return runWithPermission(
      context.supabase,
      "payroll.compensation.edit",
      null,
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

        // Staff muss zur eigenen Org gehören.
        const staffRow = expectMaybe<{ id: string }>(
          await supabaseAdmin
            .from("staff")
            .select("id")
            .eq("id", data.staffId)
            .eq("organization_id", caller.organizationId)
            .maybeSingle(),
          "upsertStaffCompensation.loadStaff",
        );
        if (!staffRow) throw new Error("Mitarbeiter nicht gefunden");

        // Null = Eintrag löschen.
        if (data.hourlyRate === null) {
          expectVoid(
            await supabaseAdmin
              .from("staff_compensation")
              .delete()
              .eq("staff_id", data.staffId)
              .eq("organization_id", caller.organizationId),
            "upsertStaffCompensation.delete",
          );
          return {
            result: { ok: true as const },
            audit: {
              action: "staff_compensation.delete",
              entity: "staff_compensation",
              entityId: data.staffId,
              meta: { changed: { hourly_rate: "[REDACTED]" } },
            },
          };
        }

        const validFrom = data.validFrom ?? todayISO();
        expectVoid(
          await supabaseAdmin.from("staff_compensation").upsert(
            {
              staff_id: data.staffId,
              organization_id: caller.organizationId,
              hourly_rate: data.hourlyRate,
              valid_from: validFrom,
            },
            { onConflict: "staff_id" },
          ),
          "upsertStaffCompensation.upsert",
        );

        return {
          result: { ok: true as const },
          audit: {
            action: "staff_compensation.upsert",
            entity: "staff_compensation",
            entityId: data.staffId,
            meta: { changed: { hourly_rate: "[REDACTED]", valid_from: validFrom } },
          },
        };
      },
    );
  });
