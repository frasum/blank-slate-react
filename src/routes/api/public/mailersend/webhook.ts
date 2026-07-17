// MailerSend Inbound-Webhook (BM1): Lieferanten-Antworten am Bestellvorgang.
//
// Endpunkt: /api/public/mailersend/webhook. Absicherung: MailerSend sendet den
// Header `signature` (HMAC-SHA256(hex) über den Raw-Body mit dem in MailerSend
// hinterlegten Signing-Secret). Wir vergleichen timing-safe gegen
// MAILERSEND_WEBHOOK_SECRET. Kein Signaturheader → 401. Kein Retry-Loop:
// alle unbekannten Fehler enden in einer 200er-Antwort mit Diagnose-Payload,
// damit MailerSend nicht endlos zustellt; harte Signaturfehler sind 401.
//
// Zuordnung:
//  1) In-Reply-To/References-Header → order_email_log.provider_message_id.
//  2) Fallback: Regex ORD-YYYY-MM-NNNN im Subject.
//  3) Keine Zuordnung → Ablage mit order_id = NULL (Postfach-Inbox).
//
// Anhänge werden base64-dekodiert und in den privaten Bucket
// `order-reply-attachments` unter <org>/<reply_id>/<uuid>-<name> geschrieben.

import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";

const ORDER_NUMBER_RE = /ORD-\d{4}-\d{2}-\d{4}/;

type InboundAttachment = {
  file_name?: string;
  filename?: string;
  content_type?: string;
  contentType?: string;
  size?: number;
  content?: string; // base64
};

type InboundData = {
  from?: { email?: string; name?: string } | string;
  sender?: string;
  subject?: string;
  text?: string;
  html?: string;
  headers?: Array<{ name?: string; value?: string }> | Record<string, string>;
  attachments?: InboundAttachment[];
  id?: string;
  message_id?: string;
};

type InboundPayload = {
  type?: string;
  data?: InboundData;
} & InboundData;

function safeEqualHex(a: string, b: string): boolean {
  try {
    const left = Buffer.from(a, "hex");
    const right = Buffer.from(b, "hex");
    return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

function extractHeader(
  headers: InboundData["headers"] | undefined,
  name: string,
): string | null {
  if (!headers) return null;
  const lower = name.toLowerCase();
  if (Array.isArray(headers)) {
    for (const h of headers) {
      if ((h?.name ?? "").toLowerCase() === lower) return h?.value ?? null;
    }
    return null;
  }
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return String(v);
  }
  return null;
}

function parseFrom(from: InboundData["from"], sender: string | undefined) {
  if (typeof from === "string") return { email: from, name: null as string | null };
  if (from && typeof from === "object")
    return { email: from.email ?? sender ?? "", name: from.name ?? null };
  return { email: sender ?? "", name: null };
}

function extractMessageIds(raw: string | null): string[] {
  if (!raw) return [];
  return Array.from(raw.matchAll(/<([^<>\s]+)>/g)).map((m) => m[1]);
}

export const Route = createFileRoute("/api/public/mailersend/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.MAILERSEND_WEBHOOK_SECRET;
        if (!secret) return new Response("Webhook nicht konfiguriert", { status: 503 });

        const rawBody = await request.text();
        const signatureHeader =
          request.headers.get("signature") ??
          request.headers.get("x-mailersend-signature") ??
          "";
        const signature = signatureHeader.replace(/^sha256=/i, "").trim();
        const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
        if (!safeEqualHex(signature, expected)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: InboundPayload;
        try {
          payload = JSON.parse(rawBody) as InboundPayload;
        } catch {
          return Response.json({ ok: true, ignored: "invalid-json" });
        }

        const inbound: InboundData = payload.data ?? payload;
        const from = parseFrom(inbound.from, inbound.sender);
        const subject = (inbound.subject ?? "").trim();
        const bodyText = inbound.text ?? "";
        const messageId = inbound.message_id ?? inbound.id ?? null;
        const inReplyToRaw = extractHeader(inbound.headers, "In-Reply-To");
        const referencesRaw = extractHeader(inbound.headers, "References");
        const threadIds = [
          ...extractMessageIds(inReplyToRaw),
          ...extractMessageIds(referencesRaw),
        ];

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Zuordnung 1: Thread-Header → order_email_log
        let orderId: string | null = null;
        let organizationId: string | null = null;
        if (threadIds.length > 0) {
          const { data: logRow } = await supabaseAdmin
            .from("order_email_log")
            .select("order_id, organization_id")
            .in("provider_message_id", threadIds)
            .limit(1)
            .maybeSingle();
          if (logRow) {
            orderId = logRow.order_id;
            organizationId = logRow.organization_id;
          }
        }

        // Zuordnung 2: Bestellnummer im Subject
        if (!orderId) {
          const m = ORDER_NUMBER_RE.exec(subject);
          if (m) {
            const { data: order } = await supabaseAdmin
              .from("orders")
              .select("id, organization_id")
              .eq("order_number", m[0])
              .maybeSingle();
            if (order) {
              orderId = order.id;
              organizationId = order.organization_id;
            }
          }
        }

        // Fallback-Org: erste Organisation (Postfach-Inbox).
        if (!organizationId) {
          const { data: anyOrg } = await supabaseAdmin
            .from("organizations")
            .select("id")
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (!anyOrg) return Response.json({ ok: true, ignored: "no-organization" });
          organizationId = anyOrg.id;
        }

        // Idempotenz via UNIQUE(organization_id, message_id).
        const { data: reply, error: insertErr } = await supabaseAdmin
          .from("order_replies")
          .upsert(
            {
              organization_id: organizationId,
              order_id: orderId,
              from_email: from.email || "unknown@invalid",
              from_name: from.name,
              subject: subject || null,
              body_text: bodyText || null,
              message_id: messageId,
            },
            { onConflict: "organization_id,message_id", ignoreDuplicates: false },
          )
          .select("id")
          .single();
        if (insertErr || !reply) {
          return Response.json({ ok: true, ignored: "insert-error", error: insertErr?.message });
        }

        // Anhänge in Bucket + Metadaten
        const attachments = inbound.attachments ?? [];
        for (const att of attachments) {
          const name = att.file_name ?? att.filename ?? "attachment";
          const type = att.content_type ?? att.contentType ?? "application/octet-stream";
          const content = att.content;
          if (!content) continue;
          const bytes = Buffer.from(content, "base64");
          const path = `${organizationId}/${reply.id}/${randomUUID()}-${name.replace(/[^A-Za-z0-9._-]/g, "_")}`;
          const { error: upErr } = await supabaseAdmin.storage
            .from("order-reply-attachments")
            .upload(path, bytes, { contentType: type, upsert: false });
          if (upErr) continue;
          await supabaseAdmin.from("order_reply_attachments").insert({
            organization_id: organizationId,
            reply_id: reply.id,
            file_name: name,
            content_type: type,
            size_bytes: att.size ?? bytes.byteLength,
            storage_path: path,
          });
        }

        return Response.json({ ok: true, reply_id: reply.id, assigned: Boolean(orderId) });
      },
    },
  },
});