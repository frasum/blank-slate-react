// Server-Functions für Lieferanten-Stammdaten (Welle 1-B).
// Org-scoped, Manager+ für Schreibrechte, Audit-Log auf jede Änderung.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { runGuarded } from "@/lib/admin/admin-call";
import { writeAuditLog } from "@/lib/admin/audit";

function makeAuditWriter(caller: { organizationId: string; userId: string; staffId: string }) {
  return async (entry: {
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
}

const SupplierInput = z.object({
  name: z.string().trim().min(1).max(200),
  email: z
    .string()
    .trim()
    .email()
    .max(200)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  phone: z
    .string()
    .trim()
    .max(60)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  address: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  customerNumber: z
    .string()
    .trim()
    .max(80)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  contactPerson: z
    .string()
    .trim()
    .max(120)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  notes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  deliveryDays: z.array(z.string().min(1).max(8)).max(7).optional().nullable(),
  orderDeadline: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format HH:MM")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  minOrderValueCents: z.number().int().min(0).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export const listSuppliers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ includeInactive: z.boolean().optional() })
      .partial()
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("suppliers")
      .select(
        "id, name, email, phone, address, customer_number, contact_person, notes, delivery_days, order_deadline, min_order_value_cents, is_active, sort_order, created_at, updated_at",
      )
      .eq("organization_id", caller.organizationId)
      .order("sort_order")
      .order("name");
    if (!data.includeInactive) q = q.eq("is_active", true);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const createSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SupplierInput.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: row, error } = await supabaseAdmin
        .from("suppliers")
        .insert({
          organization_id: caller.organizationId,
          name: data.name,
          email: data.email,
          phone: data.phone,
          address: data.address,
          customer_number: data.customerNumber,
          contact_person: data.contactPerson,
          notes: data.notes,
          delivery_days: data.deliveryDays ?? null,
          order_deadline: data.orderDeadline,
          min_order_value_cents: data.minOrderValueCents ?? null,
          sort_order: data.sortOrder ?? 0,
        })
        .select("id")
        .single();
      if (error) throw error;
      return {
        result: { id: row.id },
        audit: {
          action: "supplier.create",
          entity: "supplier",
          entityId: row.id,
          meta: { name: data.name },
        },
      };
    });
  });

export const updateSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SupplierInput.extend({ supplierId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin
        .from("suppliers")
        .update({
          name: data.name,
          email: data.email,
          phone: data.phone,
          address: data.address,
          customer_number: data.customerNumber,
          contact_person: data.contactPerson,
          notes: data.notes,
          delivery_days: data.deliveryDays ?? null,
          order_deadline: data.orderDeadline,
          min_order_value_cents: data.minOrderValueCents ?? null,
          sort_order: data.sortOrder ?? 0,
        })
        .eq("id", data.supplierId)
        .eq("organization_id", caller.organizationId);
      if (error) throw error;
      return {
        result: { ok: true as const },
        audit: {
          action: "supplier.update",
          entity: "supplier",
          entityId: data.supplierId,
          meta: { name: data.name },
        },
      };
    });
  });

export const setSupplierActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ supplierId: z.string().uuid(), isActive: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin
        .from("suppliers")
        .update({ is_active: data.isActive })
        .eq("id", data.supplierId)
        .eq("organization_id", caller.organizationId);
      if (error) throw error;
      return {
        result: { ok: true as const },
        audit: {
          action: data.isActive ? "supplier.activate" : "supplier.deactivate",
          entity: "supplier",
          entityId: data.supplierId,
        },
      };
    });
  });
