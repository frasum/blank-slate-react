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
import { makeAuditWriter } from "@/lib/admin/audit";
import {
  buildOrderEmailHtml,
  buildOrderEmailSubject,
  buildOrderEmailText,
  type OrderEmailData,
} from "./order-email";

const READ_ROLES = ["staff", "manager", "admin"] as const;

export const createOrderFromCart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        notes: z.string().trim().max(2000).optional(),
        supplierId: z.string().uuid().optional(),
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
        p_supplier_id: data.supplierId,
      });
      if (error) throw new Error(error.message);
      const ids = (orderIds ?? []) as string[];
      return {
        result: { orderIds: ids },
        audit: {
          action: "order.create",
          entity: "order",
          meta: { orderIds: ids, supplierCount: ids.length, supplierId: data.supplierId ?? null },
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
        from: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        to: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
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
        "id, order_number, supplier_id, location_id, status, total_amount_cents, delivery_date, time_window, email_sent, email_sent_at, email_message_id, email_error, created_at",
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

// Welle 1-E (Lieferanten-Katalog): Pro Artikel die jüngste, nicht stornierte
// Bestellung als (Datum, Menge, Wer). „Wer" wird aus dem Audit-Log gelesen
// (orders trägt keinen user_id); fehlt der Audit-Eintrag oder der Staff-Name,
// bleibt orderedBy=null.
export const getLastOrderByArticle = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, READ_ROLES);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Schritt 1: order_items + orders (jüngste, nicht stornierte zuerst).
    const { data: rows, error } = await supabaseAdmin
      .from("order_items")
      .select("article_id, quantity, unit, orders!inner(id, created_at, status, organization_id)")
      .eq("organization_id", caller.organizationId)
      .eq("orders.organization_id", caller.organizationId)
      .neq("orders.status", "cancelled")
      .not("article_id", "is", null)
      .order("created_at", { foreignTable: "orders", ascending: false })
      .limit(2000);
    if (error) throw error;

    type Row = {
      article_id: string | null;
      quantity: number;
      unit: string | null;
      orders: { id: string; created_at: string; status: string } | null;
    };
    const typed = (rows ?? []) as unknown as Row[];

    const lastByArticle = new Map<
      string,
      { orderId: string; date: string; quantity: number; unit: string | null }
    >();
    for (const r of typed) {
      if (!r.article_id || !r.orders) continue;
      if (lastByArticle.has(r.article_id)) continue;
      lastByArticle.set(r.article_id, {
        orderId: r.orders.id,
        date: r.orders.created_at,
        quantity: Number(r.quantity),
        unit: r.unit,
      });
    }

    if (lastByArticle.size === 0) {
      return {} as Record<
        string,
        { date: string; quantity: number; unit: string | null; orderedBy: string | null }
      >;
    }

    // Schritt 2: Audit-Log → Map orderId → actor_staff_id.
    // order.create-Einträge enthalten meta.orderIds: string[] (mehrere Orders
    // pro Cart-Auslösung). Wir scannen die letzten 1000 Einträge der Org und
    // bauen die Zuordnung in JS.
    const { data: auditRows, error: aErr } = await supabaseAdmin
      .from("audit_log")
      .select("actor_staff_id, meta")
      .eq("organization_id", caller.organizationId)
      .eq("entity", "order")
      .eq("action", "order.create")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (aErr) throw aErr;

    const staffByOrder = new Map<string, string>();
    for (const a of auditRows ?? []) {
      if (!a.actor_staff_id) continue;
      const meta = (a.meta ?? {}) as { orderIds?: unknown };
      const ids = Array.isArray(meta.orderIds) ? meta.orderIds : [];
      for (const oid of ids) {
        if (typeof oid === "string" && !staffByOrder.has(oid)) {
          staffByOrder.set(oid, a.actor_staff_id);
        }
      }
    }

    // Schritt 3: Staff-Namen für die referenzierten Staff-IDs nachladen.
    const staffIds = Array.from(new Set(Array.from(staffByOrder.values())));
    const nameByStaff = new Map<string, string>();
    if (staffIds.length > 0) {
      const { data: staffRows, error: sErr } = await supabaseAdmin
        .from("staff")
        .select("id, display_name, first_name, last_name")
        .eq("organization_id", caller.organizationId)
        .in("id", staffIds);
      if (sErr) throw sErr;
      for (const s of staffRows ?? []) {
        const name =
          (s.display_name && s.display_name.trim()) ||
          `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() ||
          null;
        if (name) nameByStaff.set(s.id, name);
      }
    }

    const out: Record<
      string,
      { date: string; quantity: number; unit: string | null; orderedBy: string | null }
    > = {};
    for (const [articleId, info] of lastByArticle.entries()) {
      const staffId = staffByOrder.get(info.orderId) ?? null;
      const orderedBy = staffId ? (nameByStaff.get(staffId) ?? null) : null;
      out[articleId] = {
        date: info.date,
        quantity: info.quantity,
        unit: info.unit,
        orderedBy,
      };
    }
    return out;
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
      if (!apiKey)
        throw new Error("Mailversand ist nicht konfiguriert (MAILERSEND_API_KEY fehlt).");
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
      if (!supplier.email) throw new Error("Lieferant hat keine E-Mail-Adresse hinterlegt.");

      let restaurantName = "";
      if (order.location_id) {
        const { data: loc } = await supabaseAdmin
          // ST1: bewusst ungefiltert — Daten-Zugriff (Namens-Lookup an historischer Bestellung).
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
        throw new Error(`Mailversand fehlgeschlagen (${res.status}). ${body.slice(0, 300)}`);
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
