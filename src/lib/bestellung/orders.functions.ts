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
import {
  buildOrderEmailHtml,
  buildOrderEmailSubject,
  buildOrderEmailText,
  type OrderEmailData,
} from "./order-email";

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
        p_notes: data.notes,
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

// Welle 1-D — Mailversand an Lieferanten via MailerSend HTTP-API (kein SMTP,
// Cloudflare Workers können keine SMTP-Sockets öffnen). Secrets werden INSIDE
// des Handlers gelesen (Module-Scope process.env ist im Worker undefined).
// 2xx (insb. 202 Accepted = asynchron eingereiht) gilt als Erfolg. Hinweis:
// 202 bedeutet "in Queue", nicht "zugestellt" — spätere Hard-Bounces (z. B.
// ungültige Lieferantenadresse) ändern den Status nicht zurück. Webhook-basierte
// Delivery-Events sind Out-of-Scope für 1-D.
export const sendOrderEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const processMod = await import("node:process");
      const env = processMod.default.env;

      const apiKey = env.MAILERSEND_API_KEY;
      const fromEmail = env.MAILERSEND_FROM_EMAIL;
      const fromName = env.MAILERSEND_FROM_NAME ?? "Bestellung COCO";
      if (!apiKey) throw new Error("Mailversand ist nicht konfiguriert (MAILERSEND_API_KEY fehlt).");
      if (!fromEmail) throw new Error("Absenderadresse fehlt (MAILERSEND_FROM_EMAIL).");

      const { data: order, error: oErr } = await supabaseAdmin
        .from("orders")
        .select(
          "id, order_number, supplier_id, location_id, status, total_amount_cents, delivery_date, time_window, delivery_address, notes",
        )
        .eq("id", data.orderId)
        .eq("organization_id", caller.organizationId)
        .maybeSingle();
      if (oErr) throw oErr;
      if (!order) throw new Error("Bestellung nicht gefunden.");
      if (order.status === "cancelled")
        throw new Error("Stornierte Bestellung kann nicht versendet werden.");

      const { data: supplier, error: sErr } = await supabaseAdmin
        .from("suppliers")
        .select("id, name, email, customer_number")
        .eq("id", order.supplier_id)
        .eq("organization_id", caller.organizationId)
        .maybeSingle();
      if (sErr) throw sErr;
      if (!supplier) throw new Error("Lieferant nicht gefunden.");
      if (!supplier.email)
        throw new Error("Lieferant hat keine E-Mail-Adresse hinterlegt.");

      let restaurantName = "";
      if (order.location_id) {
        const { data: loc } = await supabaseAdmin
          .from("locations")
          .select("name")
          .eq("id", order.location_id)
          .maybeSingle();
        restaurantName = loc?.name ?? "";
      }

      const { data: items, error: iErr } = await supabaseAdmin
        .from("order_items")
        .select(
          "article_name, sku, quantity, unit, unit_price_cents, total_price_cents, is_free_text_item",
        )
        .eq("order_id", order.id)
        .order("created_at");
      if (iErr) throw iErr;

      const emailData: OrderEmailData = {
        orderNumber: order.order_number,
        supplierName: supplier.name,
        customerNumber: supplier.customer_number,
        restaurantName,
        deliveryAddress: order.delivery_address ?? "",
        deliveryDate: order.delivery_date,
        timeWindow: order.time_window,
        notes: order.notes,
        items: (items ?? []).map((it) => ({
          articleName: it.article_name,
          sku: it.sku,
          quantity: Number(it.quantity),
          unit: it.unit,
          unitPriceCents: Number(it.unit_price_cents),
          totalPriceCents: Number(it.total_price_cents),
          isFreeText: it.is_free_text_item,
        })),
        totalAmountCents: Number(order.total_amount_cents),
      };

      const res = await fetch("https://api.mailersend.com/v1/email", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({
          from: { email: fromEmail, name: fromName },
          to: [{ email: supplier.email, name: supplier.name }],
          subject: buildOrderEmailSubject(emailData),
          html: buildOrderEmailHtml(emailData),
          text: buildOrderEmailText(emailData),
        }),
      });
      // 202 Accepted = Erfolg (asynchroner Versand). res.ok deckt 202 ab.
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
          `Mailversand fehlgeschlagen (${res.status}). ${body.slice(0, 300)}`,
        );
      }

      const { error: upErr } = await supabaseAdmin
        .from("orders")
        .update({
          status: "sent",
          email_sent: true,
          email_sent_at: new Date().toISOString(),
        })
        .eq("id", order.id)
        .eq("organization_id", caller.organizationId);
      if (upErr) throw upErr;

      return {
        result: { ok: true as const, orderId: order.id },
        audit: {
          action: "order.email_sent",
          entity: "order",
          entityId: order.id,
          meta: {
            orderNumber: order.order_number,
            supplierId: supplier.id,
            wasResend: order.status === "sent",
          },
        },
      };
    });
  });