// MailerSend Inbound-Webhook (BM1): Lieferanten-Antworten am Bestellvorgang.
//
// Endpunkt: /api/public/mailersend/webhook. Absicherung: HMAC-SHA256(hex)
// über den Raw-Body mit MAILERSEND_WEBHOOK_SECRET, timing-safe verglichen.
// Kein Signaturheader / falsche Signatur → 401. Nach erfolgreicher Prüfung
// antwortet der Endpunkt IMMER 200, damit MailerSend nicht endlos retriet;
// Diagnose-Informationen wandern in den Response-Body.
//
// Zuordnungskette (BM1/K2):
//   1) Plus-Adresse im Empfänger (antwort+ORD-YYYY-MM-NNNN@…) — Primärweg.
//   2) Thread-Header (In-Reply-To/References → order_email_log.provider_message_id).
//   3) Bestellnummer im Subject (Regex).
//   4) Keine Zuordnung → Ablage mit order_id = NULL unter der Default-Org
//      aus INBOUND_DEFAULT_ORGANIZATION_ID (K3). Fehlt das Env, wird die Mail
//      mit 200 verworfen und ein Warn-Log ausgegeben — NIE „erste Org raten".
//
// Anhänge (K4): nur PDF/JPEG/PNG, je ≤ 10 MB. Übersprungene Anhänge werden
// als kurzer Vermerk an body_text angehängt.
//
// Weiterleitung (K5a): unzugeordnete Mails werden per MailerSend an
// buchhaltung@yum-thai.de weitergeleitet, wenn
// organization_settings.order_reply_forward_unassigned = true.
// K5b (Telegram-Ping) ist bewusst noch nicht verdrahtet: weder Location-
// Chat noch Admin-Chat existieren in der DB, und orders trägt kein
// created_by — daher separater Folge-Prompt.

import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { extractOrderNumberFromRecipients } from "@/lib/bestellung/inbound-plus";

const ORDER_NUMBER_RE = /ORD-\d{4}-\d{2}-\d{4}/i;
const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png"]);
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const FORWARD_TO_EMAIL = "buchhaltung@yum-thai.de";

type InboundAttachment = {
  file_name?: string;
  filename?: string;
  content_type?: string;
  contentType?: string;
  size?: number;
  content?: string;
};

type InboundRecipient = string | { email?: string | null; name?: string | null } | null;

type InboundData = {
  from?: { email?: string; name?: string } | string;
  sender?: string;
  to?: InboundRecipient | InboundRecipient[];
  recipients?: InboundRecipient[];
  subject?: string;
  text?: string;
  html?: string;
  headers?: Array<{ name?: string; value?: string }> | Record<string, string>;
  attachments?: InboundAttachment[];
  id?: string;
  message_id?: string;
};

type InboundPayload = { type?: string; data?: InboundData } & InboundData;

function safeEqualHex(a: string, b: string): boolean {
  try {
    const left = Buffer.from(a, "hex");
    const right = Buffer.from(b, "hex");
    return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

function extractHeader(headers: InboundData["headers"] | undefined, name: string): string | null {
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

function collectRecipients(inbound: InboundData): InboundRecipient[] {
  const out: InboundRecipient[] = [];
  if (Array.isArray(inbound.to)) out.push(...inbound.to);
  else if (inbound.to) out.push(inbound.to);
  if (Array.isArray(inbound.recipients)) out.push(...inbound.recipients);
  return out;
}

async function forwardUnassigned(params: {
  fromName: string | null;
  fromEmail: string;
  subject: string;
  bodyText: string;
}): Promise<void> {
  const apiKey = process.env.MAILERSEND_API_KEY;
  const senderEmail = process.env.MAILERSEND_FROM_EMAIL;
  const senderName = process.env.MAILERSEND_FROM_NAME ?? "COCO Bestellung";
  if (!apiKey || !senderEmail) return;
  const body = {
    from: { email: senderEmail, name: senderName },
    to: [{ email: FORWARD_TO_EMAIL, name: "Buchhaltung" }],
    subject: `[COCO unzugeordnet] ${params.subject || "(ohne Betreff)"}`,
    text: [
      `Absender: ${params.fromName ? `${params.fromName} <${params.fromEmail}>` : params.fromEmail}`,
      `Betreff: ${params.subject || "(leer)"}`,
      "",
      params.bodyText || "(kein Textkörper)",
    ].join("\n"),
  };
  await fetch("https://api.mailersend.com/v1/email", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: JSON.stringify(body),
  }).catch(() => {
    /* best-effort */
  });
}

export const Route = createFileRoute("/api/public/mailersend/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.MAILERSEND_WEBHOOK_SECRET;
        if (!secret) return new Response("Webhook nicht konfiguriert", { status: 503 });

        const rawBody = await request.text();
        const signatureHeader =
          request.headers.get("signature") ?? request.headers.get("x-mailersend-signature") ?? "";
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
        let bodyText = inbound.text ?? "";
        const messageId = inbound.message_id ?? inbound.id ?? null;
        const inReplyToRaw = extractHeader(inbound.headers, "In-Reply-To");
        const referencesRaw = extractHeader(inbound.headers, "References");
        const threadIds = [...extractMessageIds(inReplyToRaw), ...extractMessageIds(referencesRaw)];

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let orderId: string | null = null;
        let organizationId: string | null = null;

        // Stufe 1: Plus-Adresse.
        const plusOrderNumber = extractOrderNumberFromRecipients(collectRecipients(inbound));
        if (plusOrderNumber) {
          const { data: order } = await supabaseAdmin
            .from("orders")
            .select("id, organization_id")
            .eq("order_number", plusOrderNumber)
            .maybeSingle();
          if (order) {
            orderId = order.id;
            organizationId = order.organization_id;
          }
        }

        // Stufe 2: Thread-Header.
        if (!orderId && threadIds.length > 0) {
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

        // Stufe 3: Bestellnummer im Subject.
        if (!orderId) {
          const m = ORDER_NUMBER_RE.exec(subject);
          if (m) {
            const { data: order } = await supabaseAdmin
              .from("orders")
              .select("id, organization_id")
              .eq("order_number", m[0].toUpperCase())
              .maybeSingle();
            if (order) {
              orderId = order.id;
              organizationId = order.organization_id;
            }
          }
        }

        // K3 — Default-Org aus Env; NIE „erste Org raten".
        if (!organizationId) {
          const defaultOrg = process.env.INBOUND_DEFAULT_ORGANIZATION_ID?.trim();
          if (!defaultOrg) {
            console.warn(
              "[mailersend/webhook] Unzugeordnete Mail verworfen: INBOUND_DEFAULT_ORGANIZATION_ID fehlt.",
            );
            return Response.json({ ok: true, ignored: "no-default-org" });
          }
          organizationId = defaultOrg;
        }

        // Anhang-Vorprüfung + Skip-Vermerke (K4).
        const rawAttachments = inbound.attachments ?? [];
        const attachmentsToStore: { name: string; type: string; bytes: Buffer }[] = [];
        const skipNotes: string[] = [];
        for (const att of rawAttachments) {
          const name = att.file_name ?? att.filename ?? "attachment";
          const type = (att.content_type ?? att.contentType ?? "").toLowerCase();
          if (!att.content) continue;
          if (!ALLOWED_MIME.has(type)) {
            skipNotes.push(`[Anhang übersprungen: ${name} (Typ ${type || "unbekannt"})]`);
            continue;
          }
          const bytes = Buffer.from(att.content, "base64");
          if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
            skipNotes.push(`[Anhang übersprungen: ${name} (> 10 MB)]`);
            continue;
          }
          attachmentsToStore.push({ name, type, bytes });
        }
        if (skipNotes.length > 0) {
          bodyText = `${bodyText}${bodyText ? "\n\n" : ""}${skipNotes.join("\n")}`;
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

        for (const att of attachmentsToStore) {
          const path = `${organizationId}/${reply.id}/${randomUUID()}-${att.name.replace(/[^A-Za-z0-9._-]/g, "_")}`;
          const { error: upErr } = await supabaseAdmin.storage
            .from("order-reply-attachments")
            .upload(path, att.bytes, { contentType: att.type, upsert: false });
          if (upErr) continue;
          await supabaseAdmin.from("order_reply_attachments").insert({
            organization_id: organizationId,
            reply_id: reply.id,
            file_name: att.name,
            content_type: att.type,
            size_bytes: att.bytes.byteLength,
            storage_path: path,
          });
        }

        // K5a — Weiterleitung bei unzugeordneten Mails.
        if (!orderId) {
          const { data: setting } = await supabaseAdmin
            .from("organization_settings")
            .select("order_reply_forward_unassigned")
            .eq("organization_id", organizationId)
            .maybeSingle();
          if (setting?.order_reply_forward_unassigned) {
            await forwardUnassigned({
              fromName: from.name,
              fromEmail: from.email,
              subject,
              bodyText,
            });
          }
        }

        return Response.json({ ok: true, reply_id: reply.id, assigned: Boolean(orderId) });
      },
    },
  },
});
