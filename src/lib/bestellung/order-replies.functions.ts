// BM1: Lieferanten-Antworten am Bestellvorgang.
//
// Lese-Zugriff: Manager+/Admin derselben Organisation (RLS erledigt die
// Sichtbarkeit auf `order_replies`/`order_reply_attachments`; Anhänge werden
// per signierter URL aus dem privaten Bucket `order-reply-attachments`
// bereitgestellt, dafür ist der Admin-Client nötig).
//
// Schreibpfad: nur manuelle Zuordnung / Als-gelesen. Kein Insert von Client.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeAuditLog } from "@/lib/admin/audit";

export type OrderReplyAttachment = {
  id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  signed_url: string | null;
};

export type OrderReplyRow = {
  id: string;
  order_id: string | null;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  body_text: string | null;
  received_at: string;
  read_at: string | null;
  assigned_at: string | null;
  attachments: OrderReplyAttachment[];
};

async function loadAttachments(
  supabaseAdmin: SupabaseClient,
  replyIds: string[],
): Promise<Map<string, OrderReplyAttachment[]>> {
  const map = new Map<string, OrderReplyAttachment[]>();
  if (replyIds.length === 0) return map;
  const { data } = await supabaseAdmin
    .from("order_reply_attachments")
    .select("id, reply_id, file_name, content_type, size_bytes, storage_path")
    .in("reply_id", replyIds);
  for (const row of data ?? []) {
    const { data: signed } = await supabaseAdmin.storage
      .from("order-reply-attachments")
      .createSignedUrl(row.storage_path as string, 60 * 10);
    const list = map.get(row.reply_id as string) ?? [];
    list.push({
      id: row.id as string,
      file_name: row.file_name as string,
      content_type: row.content_type as string,
      size_bytes: Number(row.size_bytes),
      signed_url: signed?.signedUrl ?? null,
    });
    map.set(row.reply_id as string, list);
  }
  return map;
}

export const listOrderReplies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ orderId: z.string().uuid().optional(), unassignedOnly: z.boolean().optional() })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<OrderReplyRow[]> => {
    let q = context.supabase
      .from("order_replies")
      .select(
        "id, order_id, from_email, from_name, subject, body_text, received_at, read_at, assigned_at",
      )
      .order("received_at", { ascending: false })
      .limit(200);
    if (data.orderId) q = q.eq("order_id", data.orderId);
    if (data.unassignedOnly) q = q.is("order_id", null);
    const { data: rows, error } = await q;
    if (error) throw error;
    if (!rows || rows.length === 0) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const attMap = await loadAttachments(
      supabaseAdmin,
      rows.map((r) => r.id as string),
    );
    return rows.map((r) => ({
      id: r.id as string,
      order_id: r.order_id as string | null,
      from_email: r.from_email as string,
      from_name: r.from_name as string | null,
      subject: r.subject as string | null,
      body_text: r.body_text as string | null,
      received_at: r.received_at as string,
      read_at: r.read_at as string | null,
      assigned_at: r.assigned_at as string | null,
      attachments: attMap.get(r.id as string) ?? [],
    }));
  });

export const assignOrderReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ replyId: z.string().uuid(), orderId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const staffId = (context.claims?.staff_id as string | undefined) ?? null;
    return assignOrderReplyCore({
      authed: context.supabase,
      admin: supabaseAdmin,
      userId: context.userId,
      staffId,
      replyId: data.replyId,
      orderId: data.orderId,
    });
  });

// Testbarer Kern von assignOrderReply (K6). Sichtbarkeit läuft über den
// RLS-Client des Aufrufers; Cross-Org-Orders sind unsichtbar und der
// Guard schlägt fehl. Audit-Log ausschließlich bei Erfolg.
export async function assignOrderReplyCore(params: {
  authed: SupabaseClient<Database>;
  admin: SupabaseClient<Database>;
  userId: string;
  staffId: string | null;
  replyId: string;
  orderId: string;
}): Promise<{ ok: true }> {
  const { data: reply, error: rErr } = await params.authed
    .from("order_replies")
    .select("id, organization_id")
    .eq("id", params.replyId)
    .maybeSingle();
  if (rErr) throw rErr;
  if (!reply) throw new Error("Antwort nicht gefunden");
  const { data: order, error: oErr } = await params.authed
    .from("orders")
    .select("id, organization_id")
    .eq("id", params.orderId)
    .maybeSingle();
  if (oErr) throw oErr;
  if (!order || order.organization_id !== reply.organization_id) {
    throw new Error("Bestellung nicht in derselben Organisation");
  }
  const { error } = await params.admin
    .from("order_replies")
    .update({
      order_id: params.orderId,
      assigned_at: new Date().toISOString(),
      assigned_by: params.staffId,
    })
    .eq("id", params.replyId);
  if (error) throw error;
  await writeAuditLog({
    organizationId: reply.organization_id as string,
    actorUserId: params.userId,
    actorStaffId: params.staffId,
    action: "order_reply.assign",
    entity: "order_replies",
    entityId: params.replyId,
    meta: { order_id: params.orderId },
  });
  return { ok: true };
}

export const markOrderReplyRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ replyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: reply } = await context.supabase
      .from("order_replies")
      .select("id")
      .eq("id", data.replyId)
      .maybeSingle();
    if (!reply) throw new Error("Antwort nicht gefunden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("order_replies")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.replyId);
    if (error) throw error;
    return { ok: true };
  });

// Anzahl unzugeordneter Antworten für Badge-Anzeige.
export const countUnassignedOrderReplies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ count: number }> => {
    const { count, error } = await context.supabase
      .from("order_replies")
      .select("id", { count: "exact", head: true })
      .is("order_id", null);
    if (error) throw error;
    return { count: count ?? 0 };
  });

// Ungelesene Antworten pro Bestellung (Badge in der Bestellhistorie).
export const countUnreadRepliesByOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Record<string, number>> => {
    const { data, error } = await context.supabase
      .from("order_replies")
      .select("order_id")
      .not("order_id", "is", null)
      .is("read_at", null)
      .limit(2000);
    if (error) throw error;
    const out: Record<string, number> = {};
    for (const r of data ?? []) {
      const id = r.order_id as string | null;
      if (!id) continue;
      out[id] = (out[id] ?? 0) + 1;
    }
    return out;
  });

// Verwerfen: löscht die Antwort inkl. Anhänge (Storage + DB) und schreibt
// einen Audit-Eintrag order_reply.dismissed. Manager+ (RLS-Sichtbarkeit
// stellt die Org-Zugehörigkeit sicher).
export const dismissOrderReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ replyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: reply, error: rErr } = await context.supabase
      .from("order_replies")
      .select("id, organization_id, from_email, subject, order_id")
      .eq("id", data.replyId)
      .maybeSingle();
    if (rErr) throw rErr;
    if (!reply) throw new Error("Antwort nicht gefunden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: atts } = await supabaseAdmin
      .from("order_reply_attachments")
      .select("id, storage_path")
      .eq("reply_id", data.replyId);
    const paths = (atts ?? []).map((a) => a.storage_path as string);
    if (paths.length > 0) {
      await supabaseAdmin.storage.from("order-reply-attachments").remove(paths);
      await supabaseAdmin.from("order_reply_attachments").delete().eq("reply_id", data.replyId);
    }
    const { error } = await supabaseAdmin
      .from("order_replies")
      .delete()
      .eq("id", data.replyId);
    if (error) throw error;
    const staffId = (context.claims?.staff_id as string | undefined) ?? null;
    await writeAuditLog({
      organizationId: reply.organization_id as string,
      actorUserId: context.userId,
      actorStaffId: staffId,
      action: "order_reply.dismissed",
      entity: "order_replies",
      entityId: data.replyId,
      meta: {
        from_email: reply.from_email,
        subject: reply.subject,
        order_id: reply.order_id,
        attachments: paths.length,
      },
    });
    return { ok: true };
  });

// Frische signierte URL für einen einzelnen Anhang (10 min TTL).
// UI ruft dies bei Klick auf einen Anhang-Chip, damit URLs nicht in der
// Liste veralten.
export const getReplyAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ attachmentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    // Sichtbarkeitscheck über RLS (Anhänge folgen der Sichtbarkeit der Reply).
    const { data: row, error } = await context.supabase
      .from("order_reply_attachments")
      .select("storage_path")
      .eq("id", data.attachmentId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Anhang nicht gefunden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("order-reply-attachments")
      .createSignedUrl(row.storage_path as string, 60 * 10);
    if (sErr || !signed?.signedUrl) throw sErr ?? new Error("Signierte URL fehlgeschlagen");
    return { url: signed.signedUrl };
  });
