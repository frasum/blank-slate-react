// Server-Function `importStaffPersonalDetails` (Personaldaten Welle 2).
// Admin-only. Schreibt sensible Daten in `staff_personal_details`. Dry-Run
// schreibt nichts. Commit mit Bilanz 0/0 schreibt keinen Audit-Eintrag
// (Log-Hygiene, analog Welle 1). Audit-Meta enthält NUR Zähler +
// Feldnamen-Liste — niemals sensible Klartext-Werte.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { runGuarded } from "@/lib/admin/admin-call";
import { writeAuditLog } from "@/lib/admin/audit";
import { hashDetailsInput, type DetailsRowInput } from "./import-details";
import { runImportDetailsCore } from "./import-details-core";

const dateOrNull = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

const rowSchema = z.object({
  personnelNumber: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  salutation: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  dateOfBirth: dateOrNull,
  placeOfBirth: z.string().nullable(),
  nationality: z.string().nullable(),
  taxClass: z.string().nullable(),
  taxId: z.string().nullable(),
  socialSecurityNumber: z.string().nullable(),
  isMinijob: z.boolean().nullable(),
  isSvExempt: z.boolean().nullable(),
  healthInsurance: z.string().nullable(),
  churchTaxLiable: z.boolean().nullable(),
  childTaxAllowances: z.number().nullable(),
  iban: z.string().nullable(),
  bankName: z.string().nullable(),
  accountHolder: z.string().nullable(),
  employmentStartDate: dateOrNull,
  employmentEndDate: dateOrNull,
  personnelGroup: z.string().nullable(),
  jobTitle: z.string().nullable(),
  vacationDaysContractual: z.number().int().nullable(),
  vacationDaysPreviousYear: z.number().int().nullable(),
  vacationDaysCurrentYear: z.number().int().nullable(),
  vacationDaysTaken: z.number().int().nullable(),
});

const inputSchema = z.object({
  rows: z.array(rowSchema),
  mode: z.enum(["dry_run", "commit"]),
});

export const importStaffPersonalDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const dry = await runImportDetailsCore({
      admin: supabaseAdmin,
      organizationId: caller.organizationId,
      rows: data.rows as DetailsRowInput[],
      mode: "dry_run",
    });
    const plan = dry.plan;

    if (data.mode === "dry_run") {
      return { mode: "dry_run" as const, plan };
    }

    const noChanges = plan.totals.inserts === 0 && plan.totals.updates === 0;
    if (noChanges) {
      return { mode: "commit" as const, plan };
    }

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

    return runGuarded(caller.role, "admin", writeAudit, async () => {
      const committed = await runImportDetailsCore({
        admin: supabaseAdmin,
        organizationId: caller.organizationId,
        rows: data.rows as DetailsRowInput[],
        mode: "commit",
      });

      // Audit-Meta: KEINE Klartext-Werte, nur Feldnamen + Zähler.
      const fieldsTouchedByName = new Map<string, number>();
      for (const ops of committed.plan.ops) {
        for (const f of Object.keys(ops.fields)) {
          fieldsTouchedByName.set(f, (fieldsTouchedByName.get(f) ?? 0) + 1);
        }
      }
      const inputHash = await hashDetailsInput(data.rows as DetailsRowInput[]);

      return {
        result: { mode: "commit" as const, plan: committed.plan },
        audit: {
          action: "staff.import_personal_details",
          entity: "staff_personal_details",
          meta: {
            rows: committed.plan.totals.rows,
            staff: committed.plan.totals.staff,
            inserts: committed.plan.totals.inserts,
            updates: committed.plan.totals.updates,
            fieldsTouched: committed.plan.totals.fieldsTouched,
            fieldsTouchedByName: Object.fromEntries(fieldsTouchedByName),
            skippedCount: committed.plan.totals.skippedCount,
            inputHash,
          },
        },
      };
    });
  });
