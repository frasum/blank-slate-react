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

function buildDeliveryAddress(loc: {
  street: string | null;
  postal_code: string | null;
  city: string | null;
  delivery_notes: string | null;
  name: string;
}): string {
  const lines: string[] = [loc.name];
  if (loc.street) lines.push(loc.street);
  const cityLine = [loc.postal_code, loc.city].filter(Boolean).join(" ").trim();
  if (cityLine) lines.push(cityLine);
  if (loc.delivery_notes) lines.push(loc.delivery_notes);
  return lines.join("\n");
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

      const { data: cart, error: cartErr } = await supabaseAdmin
        .from("carts")
        .select("id, location_id, delivery_date, time_window")
        .eq("organization_id", caller.organizationId)
        .eq("user_id", caller.userId)
        .maybeSingle();
      if (cartErr) throw cartErr;
      if (!cart) throw new Error("Kein aktiver Warenkorb.");
      if (!cart.location_id) throw new Error("Standort wählen, bevor du bestellst.");

      const { data: loc, error: locErr } = await supabaseAdmin
        .from("locations")
        .select("id, name, street, postal_code, city, delivery_notes")
        .eq("id", cart.location_id)
        .eq("organization_id", caller.organizationId)
        .maybeSingle();
      if (locErr) throw locErr;
      if (!loc) throw new Error("Standort nicht gefunden.");
      const deliveryAddress = buildDeliveryAddress(loc);

      const { data: items, error: itemsErr } = await supabaseAdmin
        .from("cart_items")
        .select("id, article_id, supplier_id, quantity, is_free_text_item, free_text_name, free_text_unit")
        .eq("cart_id", cart.id);
      if (itemsErr) throw itemsErr;
      if (!items || items.length === 0) throw new Error("Warenkorb ist leer.");

      // Artikel-Snapshots vorab laden.
      const articleIds = Array.from(
        new Set(items.map((i) => i.article_id).filter((x): x is string => !!x)),
      );
      const articlesById = new Map<
        string,
        { id: string; name: string; sku: string | null; unit: string; price_cents: number; supplier_id: string }
      >();
      if (articleIds.length > 0) {
        const { data: arts, error: aErr } = await supabaseAdmin
          .from("articles")
          .select("id, name, sku, unit, price_cents, supplier_id")
          .in("id", articleIds)
          .eq("organization_id", caller.organizationId);
        if (aErr) throw aErr;
        for (const a of arts ?? []) articlesById.set(a.id, a);
      }

      // Gruppieren nach supplier_id.
      const groups = new Map<string, typeof items>();
      for (const it of items) {
        const sid = it.supplier_id;
        if (!sid) throw new Error("Cart-Item ohne Lieferant.");
        const arr = groups.get(sid) ?? [];
        arr.push(it);
        groups.set(sid, arr);
      }

      const createdOrderIds: string[] = [];
      for (const [supplierId, group] of groups) {
        const { data: order, error: oErr } = await supabaseAdmin
          .from("orders")
          .insert({
            organization_id: caller.organizationId,
            supplier_id: supplierId,
            location_id: cart.location_id,
            status: "pending",
            total_amount_cents: 0,
            delivery_date: cart.delivery_date,
            time_window: cart.time_window,
            delivery_address: deliveryAddress,
            notes: data.notes ?? null,
          })
          .select("id")
          .single();
        if (oErr) throw oErr;

        let total = 0;
        const orderItemRows = group.map((it) => {
          const a = it.article_id ? articlesById.get(it.article_id) : undefined;
          const name = it.is_free_text_item
            ? it.free_text_name ?? "Freitext"
            : a?.name ?? "Artikel";
          const unit = it.is_free_text_item
            ? it.free_text_unit ?? "Stk"
            : a?.unit ?? "Stk";
          const unitPrice = it.is_free_text_item ? 0 : a?.price_cents ?? 0;
          const totalPrice = unitPrice * it.quantity;
          total += totalPrice;
          return {
            organization_id: caller.organizationId,
            order_id: order.id,
            article_id: it.article_id,
            article_name: name,
            sku: a?.sku ?? null,
            quantity: it.quantity,
            unit,
            unit_price_cents: unitPrice,
            total_price_cents: totalPrice,
            is_free_text_item: it.is_free_text_item,
          };
        });
        const { error: oiErr } = await supabaseAdmin.from("order_items").insert(orderItemRows);
        if (oiErr) throw oiErr;

        const { error: upErr } = await supabaseAdmin
          .from("orders")
          .update({ total_amount_cents: total })
          .eq("id", order.id);
        if (upErr) throw upErr;
        createdOrderIds.push(order.id);
      }

      // Cart leeren.
      const { error: delErr } = await supabaseAdmin
        .from("cart_items")
        .delete()
        .eq("cart_id", cart.id);
      if (delErr) throw delErr;

      return {
        result: { orderIds: createdOrderIds },
        audit: {
          action: "order.create",
          entity: "order",
          meta: { orderIds: createdOrderIds, supplierCount: groups.size },
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