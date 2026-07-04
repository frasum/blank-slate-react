// Telegram-Webhook (Variante B, Verknüpfungsflow).
//
// Endpunkt: /api/public/telegram/webhook (bewusst unter /api/public/, damit die
// veröffentlichte Site nicht auth-blockiert). Absicherung: Telegram schickt
// den Header X-Telegram-Bot-Api-Secret-Token; wir verifizieren timing-safe
// gegen sha256("telegram-webhook:" + TELEGRAM_API_KEY) (base64url).
// Dieselbe Ableitung wird beim einmaligen setWebhook-Aufruf verwendet.
//
// Wir reagieren nur auf Text-Nachrichten mit „/start <token>" und ignorieren
// alles andere freundlich (200 OK). Kein Chatbot — nur Push-Verknüpfung.

import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "node:crypto";

export const parseStartCommand = (text: string | undefined | null): string | null => {
  if (!text) return null;
  const trimmed = text.trim();
  // Telegram Deep-Link liefert exakt „/start <payload>".
  const m = /^\/start(?:@[\w_]+)?\s+([A-Za-z0-9_\-]{16,128})\s*$/.exec(trimmed);
  return m ? m[1] : null;
};

function deriveWebhookSecret(telegramApiKey: string): string {
  return createHash("sha256").update(`telegram-webhook:${telegramApiKey}`).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

type TelegramMessage = {
  chat?: { id?: number | string };
  from?: { username?: string; first_name?: string };
  text?: string;
};
type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
};

async function replyToChat(chatId: number | string, text: string): Promise<void> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const telegramKey = process.env.TELEGRAM_API_KEY;
  if (!lovableKey || !telegramKey) return;
  try {
    await fetch("https://connector-gateway.lovable.dev/telegram/sendMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": telegramKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch {
    // best effort — keine erneute Webhook-Zustellung erzwingen
  }
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const telegramKey = process.env.TELEGRAM_API_KEY;
        if (!telegramKey) {
          return new Response("Telegram nicht konfiguriert", { status: 503 });
        }

        const expectedSecret = deriveWebhookSecret(telegramKey);
        const actualSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(actualSecret, expectedSecret)) {
          return new Response("Unauthorized", { status: 401 });
        }

        let update: TelegramUpdate;
        try {
          update = (await request.json()) as TelegramUpdate;
        } catch {
          return Response.json({ ok: true, ignored: "invalid-json" });
        }

        const msg = update.message ?? update.edited_message;
        const chatId = msg?.chat?.id;
        const text = msg?.text ?? "";
        const token = parseStartCommand(text);

        if (!msg || chatId === undefined || chatId === null) {
          return Response.json({ ok: true, ignored: "no-chat" });
        }
        if (!token) {
          // Freundliche Antwort auf plain /start ohne Payload — sonst schweigen.
          if (/^\/start(?:@[\w_]+)?\s*$/.test(text.trim())) {
            await replyToChat(
              chatId,
              "Um diesen Chat mit deinem COCO-Konto zu verknüpfen, öffne bitte im Mitarbeiter-Portal „Meine Daten" → „Telegram verknüpfen".",
            );
          }
          return Response.json({ ok: true, ignored: "no-token" });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Token nachschlagen. Nur nicht-abgelaufene, noch nicht verlinkte Zeilen.
        const { data: row, error: findErr } = await supabaseAdmin
          .from("staff_telegram_links")
          .select("id, organization_id, staff_id, token_expires_at, linked_at")
          .eq("link_token", token)
          .maybeSingle();
        if (findErr) {
          return Response.json({ ok: true, ignored: "lookup-error" });
        }
        if (!row) {
          await replyToChat(chatId, "❌ Ungültiger oder abgelaufener Verknüpfungs-Code.");
          return Response.json({ ok: true, ignored: "unknown-token" });
        }
        if (row.linked_at) {
          await replyToChat(chatId, "ℹ️ Dieser Code wurde bereits verwendet.");
          return Response.json({ ok: true, ignored: "already-linked" });
        }
        const expiresAt = row.token_expires_at as string | null;
        if (!expiresAt || new Date(expiresAt).getTime() < Date.now()) {
          await replyToChat(chatId, "⌛ Der Verknüpfungs-Code ist abgelaufen. Bitte neu starten.");
          return Response.json({ ok: true, ignored: "expired" });
        }

        // Staff-Namen für die Bestätigung holen (best effort).
        const { data: staff } = await supabaseAdmin
          .from("staff")
          .select("first_name, display_name")
          .eq("id", row.staff_id)
          .maybeSingle();
        const label = staff?.display_name || staff?.first_name || "deinem COCO-Konto";

        const { error: upErr } = await supabaseAdmin
          .from("staff_telegram_links")
          .update({
            telegram_chat_id: typeof chatId === "string" ? Number(chatId) : chatId,
            telegram_username: msg?.from?.username ?? null,
            linked_at: new Date().toISOString(),
            token_expires_at: null,
          })
          .eq("id", row.id);
        if (upErr) {
          return Response.json({ ok: true, ignored: "update-error" });
        }

        await replyToChat(
          chatId,
          `✅ Verknüpft mit ${label}. Ab jetzt bekommst du hier Benachrichtigungen aus COCO.`,
        );
        return Response.json({ ok: true, linked: true });
      },
    },
  },
});