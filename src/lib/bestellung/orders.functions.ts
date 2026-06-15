// Server-Functions für Bestellungen (Welle 1-C).
// createOrderFromCart gruppiert die Cart-Items nach supplier_id, snapshotet
// Artikelnamen + Einkaufspreise zu Cents, schreibt pro Lieferant eine
// orders-Zeile + order_items, berechnet total_amount_cents, leert den Cart.
// Status 'pending' — Mailversand kommt in Welle 1-D.
// Schreibrechte: Manager+ (Audit-Log via runGuarded).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { runGuarded } from "@/lib/admin/admin-call";
import { writeAuditLog } from "@/lib/admin/audit";

const READ_ROLES = ["staff", "manager", "admin"] as const;

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

export const createOrderFromCart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        notes: z.string().trim().max(2000).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: orderIds, error } = await supabaseAdmin.rpc("create_order_from_cart", {
        p_org_id: caller.organizationId,
        p_user_id: caller.userId,
        p_notes: data.notes ?? null,
      });
      if (error) throw new Error(error.message);
      const ids = (orderIds ?? []) as string[];
      return {
        result: { orderIds: ids },
        audit: {
          action: "order.create",
          entity: "order",
          meta: { orderIds: ids, supplierCount: ids.length },
        },
      };
    });
  });

export const listOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        status: z.enum(["pending", "sent", "confirmed", "cancelled"]).optional(),
        supplierId: z.string().uuid().optional(),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .partial()
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, READ_ROLES);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, supplier_id, location_id, status, total_amount_cents, delivery_date, time_window, email_sent, email_sent_at, created_at",
      )
      .eq("organization_id", caller.organizationId)
      .order("created_at", { ascending: false });
    if (data.status) q = q.eq("status", data.status);
    if (data.supplierId) q = q.eq("supplier_id", data.supplierId);
    if (data.from) q = q.gte("created_at", `${data.from}T00:00:00Z`);
    if (data.to) q = q.lte("created_at", `${data.to}T23:59:59Z`);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const getOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, READ_ROLES);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", data.orderId)
      .eq("organization_id", caller.organizationId)
      .maybeSingle();
    if (error) throw error;
    if (!order) throw new Error("Bestellung nicht gefunden.");
    const { data: items, error: iErr } = await supabaseAdmin
      .from("order_items")
      .select("*")
      .eq("order_id", order.id)
      .order("created_at");
    if (iErr) throw iErr;
    return { order, items: items ?? [] };
  });

export const cancelOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: existing, error: selErr } = await supabaseAdmin
        .from("orders")
        .select("id, status")
        .eq("id", data.orderId)
        .eq("organization_id", caller.organizationId)
        .maybeSingle();
      if (selErr) throw selErr;
      if (!existing) throw new Error("Bestellung nicht gefunden.");
      if (existing.status === "cancelled") throw new Error("Bestellung ist bereits storniert.");
      const { error } = await supabaseAdmin
        .from("orders")
        .update({ status: "cancelled" })
        .eq("id", data.orderId)
        .eq("organization_id", caller.organizationId);
      if (error) throw error;
      return {
        result: { ok: true as const },
        audit: {
          action: "order.cancel",
          entity: "order",
          entityId: data.orderId,
          meta: { previousStatus: existing.status },
        },
      };
    });
  });