// Server-only Helper: versendet eine bestehende Bestellung per MailerSend
// und setzt orders.status='sent' + email_sent / email_sent_at.
//
// Wird sowohl vom Manager-Flow (orders.functions.ts → sendOrderEmail) als
// auch vom EasyOrder-Auto-Versand benutzt (easyorder.functions.ts →
// placeEasyOrderCore), wenn der Mitarbeiter staff.can_easyorder_auto_send=true
// hat. Die Berechtigung wird vom AUFRUFER geprüft — dieser Helper macht KEINE
// eigene Rollenprüfung. Er greift mit dem übergebenen admin-Client zu, bleibt
// damit testbar und liest Secrets erst zur Laufzeit (process.env auf dem
// Worker ist nur in Handlern definiert).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  buildOrderEmailHtml,
  buildOrderEmailSubject,
  buildOrderEmailText,
  type OrderEmailData,
  type TestModeContext,
} from "./order-email";

type Admin = SupabaseClient<Database>;

export type SendOrderEmailResult = {
  ok: true;
  orderId: string;
  orderNumber: string;
  wasResend: boolean;
};

export async function sendOrderEmailWithAdmin(
  admin: Admin,
  organizationId: string,
  orderId: string,
): Promise<SendOrderEmailResult> {
  const apiKey = process.env.MAILERSEND_API_KEY;
  const fromEmail = process.env.MAILERSEND_FROM_EMAIL;
  const fromName = process.env.MAILERSEND_FROM_NAME ?? "Bestellung COCO";
  if (!apiKey) throw new Error("Mailversand ist nicht konfiguriert (MAILERSEND_API_KEY fehlt).");
  if (!fromEmail) throw new Error("Absenderadresse fehlt (MAILERSEND_FROM_EMAIL).");

  // Testmodus: Org-Settings prüfen. Wenn aktiv, gehen alle Bestellmails
  // ausschließlich an die hinterlegte Test-Adresse — Lieferant bekommt nichts.
  const { data: settings, error: setErr } = await admin
    .from("organization_settings")
    .select("test_mode_enabled, test_mode_email")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (setErr) throw setErr;
  const testEnabled = settings?.test_mode_enabled === true;
  const testEmail = settings?.test_mode_email?.trim() ?? "";
  if (testEnabled && !testEmail) {
    throw new Error("Testmodus ist aktiv, aber keine Test-E-Mail hinterlegt.");
  }

  const { data: order, error: oErr } = await admin
    .from("orders")
    .select(
      "id, order_number, supplier_id, location_id, status, total_amount_cents, delivery_date, time_window, delivery_address, notes",
    )
    .eq("id", orderId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (oErr) throw oErr;
  if (!order) throw new Error("Bestellung nicht gefunden.");
  if (order.status === "cancelled")
    throw new Error("Stornierte Bestellung kann nicht versendet werden.");

  const { data: supplier, error: sErr } = await admin
    .from("suppliers")
    .select("id, name, email, customer_number")
    .eq("id", order.supplier_id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (sErr) throw sErr;
  if (!supplier) throw new Error("Lieferant nicht gefunden.");
  if (!supplier.email) throw new Error("Lieferant hat keine E-Mail-Adresse hinterlegt.");

  const testCtx: TestModeContext | undefined = testEnabled
    ? { originalSupplierEmail: supplier.email }
    : undefined;

  let restaurantName = "";
  if (order.location_id) {
    const { data: loc } = await admin
      // ST1: bewusst ungefiltert — Daten-Zugriff (Namens-Lookup an historischer Bestellung).
      .from("locations")
      .select("name")
      .eq("id", order.location_id)
      .maybeSingle();
    restaurantName = loc?.name ?? "";
  }

  const { data: items, error: iErr } = await admin
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
      to: testCtx
        ? [{ email: testEmail, name: `TEST – ${supplier.name}` }]
        : [{ email: supplier.email, name: supplier.name }],
      subject: buildOrderEmailSubject(emailData, testCtx),
      html: buildOrderEmailHtml(emailData, testCtx),
      text: buildOrderEmailText(emailData, testCtx),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Mailversand fehlgeschlagen (${res.status}). ${body.slice(0, 300)}`);
  }

  const wasResend = order.status === "sent";
  const { error: upErr } = await admin
    .from("orders")
    .update({
      status: "sent",
      email_sent: true,
      email_sent_at: new Date().toISOString(),
    })
    .eq("id", order.id)
    .eq("organization_id", organizationId);
  if (upErr) throw upErr;

  return { ok: true, orderId: order.id, orderNumber: order.order_number, wasResend };
}
