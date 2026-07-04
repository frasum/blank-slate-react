// Telegram-Verknüpfung pro Mitarbeiter (Variante B).
//
// Verknüpfungs-Ablauf:
//   1. Mitarbeiter klickt „Mit Telegram verknüpfen" → startTelegramLink()
//      → Server generiert 32-Byte-Token, upsert in staff_telegram_links,
//        liefert Deep-Link https://t.me/<bot>?start=<token> (Bot-Handle aus
//        organization_settings.telegram_bot_username).
//   2. Browser öffnet Telegram; User tippt „Start" → Telegram sendet
//      an unseren Webhook /api/public/telegram/webhook den Text
//      „/start <token>". Der Webhook verheiratet Chat-ID und Staff.
//   3. getMyTelegramLink() liefert danach { status: "linked", handle, linkedAt }.
//
// Der Bot-Token liegt ausschließlich als Connector-Secret (TELEGRAM_API_KEY)
// serverseitig — nie im Client, nie in der DB.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";

const LINK_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 min

export type MyTelegramLinkStatus =
  | { status: "none"; botUsername: string | null }
  | {
      status: "pending";
      botUsername: string | null;
      deepLink: string | null;
      expiresAt: string;
    }
  | {
      status: "linked";
      botUsername: string | null;
      telegramUsername: string | null;
      linkedAt: string;
    };

function makeToken(): string {
  // 32 zufällige Bytes → base64url (kein Padding), ~43 Zeichen.
  return randomBytes(32).toString("base64url");
}

function deepLinkFor(botUsername: string | null, token: string): string | null {
  if (!botUsername) return null;
  const clean = botUsername.replace(/^@/, "");
  return `https://t.me/${clean}?start=${token}`;
}

export const getMyTelegramLink = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyTelegramLinkStatus> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "staff");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [linkRes, settingsRes] = await Promise.all([
      supabaseAdmin
        .from("staff_telegram_links")
        .select("telegram_chat_id, telegram_username, link_token, token_expires_at, linked_at")
        .eq("staff_id", caller.staffId)
        .maybeSingle(),
      supabaseAdmin
        .from("organization_settings")
        .select("telegram_bot_username")
        .eq("organization_id", caller.organizationId)
        .maybeSingle(),
    ]);
    if (linkRes.error) throw new Error(linkRes.error.message);
    if (settingsRes.error) throw new Error(settingsRes.error.message);

    const botUsername = (settingsRes.data?.telegram_bot_username as string | null) ?? null;
    const row = linkRes.data;

    if (!row) return { status: "none", botUsername };

    if (row.linked_at && row.telegram_chat_id) {
      return {
        status: "linked",
        botUsername,
        telegramUsername: (row.telegram_username as string | null) ?? null,
        linkedAt: row.linked_at as string,
      };
    }

    // Pending: prüfen, ob Token noch gültig.
    const expiresAt = row.token_expires_at as string | null;
    if (!expiresAt || new Date(expiresAt).getTime() < Date.now()) {
      return { status: "none", botUsername };
    }
    return {
      status: "pending",
      botUsername,
      deepLink: deepLinkFor(botUsername, row.link_token as string),
      expiresAt,
    };
  });

export const startTelegramLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{ deepLink: string | null; expiresAt: string; botUsername: string | null }> => {
      const caller = await loadAdminCaller(context.supabase, context.userId, "staff");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const token = makeToken();
      const expiresAt = new Date(Date.now() + LINK_TOKEN_TTL_MS).toISOString();

      // Upsert per staff_id — überschreibt einen ggf. laufenden Link-Vorgang.
      // Ein bereits VERKNÜPFTER Link (linked_at gesetzt) bleibt bewusst
      // erhalten: dann müsste der Mitarbeiter erst „Trennen" klicken.
      const { data: existing, error: exErr } = await supabaseAdmin
        .from("staff_telegram_links")
        .select("linked_at")
        .eq("staff_id", caller.staffId)
        .maybeSingle();
      if (exErr) throw new Error(exErr.message);
      if (existing?.linked_at) {
        throw new Error("Telegram ist bereits verknüpft. Zuerst trennen.");
      }

      const { error } = await supabaseAdmin.from("staff_telegram_links").upsert(
        {
          organization_id: caller.organizationId,
          staff_id: caller.staffId,
          link_token: token,
          token_expires_at: expiresAt,
          telegram_chat_id: null,
          telegram_username: null,
          linked_at: null,
        },
        { onConflict: "staff_id" },
      );
      if (error) throw new Error(error.message);

      const { data: settings, error: sErr } = await supabaseAdmin
        .from("organization_settings")
        .select("telegram_bot_username")
        .eq("organization_id", caller.organizationId)
        .maybeSingle();
      if (sErr) throw new Error(sErr.message);

      const botUsername = (settings?.telegram_bot_username as string | null) ?? null;
      return { deepLink: deepLinkFor(botUsername, token), expiresAt, botUsername };
    },
  );

export const unlinkTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "staff");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("staff_telegram_links")
      .delete()
      .eq("staff_id", caller.staffId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// Interner Nachrichtenversand — nur aus anderen Server-Funktionen aufrufbar
// (kein createServerFn-Wrapper, damit kein öffentlicher Endpunkt entsteht).
// Verwendet den Lovable-Connector-Gateway und liest TELEGRAM_API_KEY /
// LOVABLE_API_KEY erst im Handler.
export async function sendTelegramToStaff(params: {
  staffId: string;
  text: string;
}): Promise<{ delivered: boolean; reason?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("staff_telegram_links")
    .select("telegram_chat_id, linked_at")
    .eq("staff_id", params.staffId)
    .maybeSingle();
  if (error) return { delivered: false, reason: error.message };
  if (!data?.telegram_chat_id || !data.linked_at) {
    return { delivered: false, reason: "kein verknüpfter Telegram-Chat" };
  }

  const lovableKey = process.env.LOVABLE_API_KEY;
  const telegramKey = process.env.TELEGRAM_API_KEY;
  if (!lovableKey || !telegramKey) {
    return { delivered: false, reason: "Telegram-Konfiguration fehlt" };
  }

  const res = await fetch("https://connector-gateway.lovable.dev/telegram/sendMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": telegramKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: data.telegram_chat_id,
      text: params.text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { delivered: false, reason: `HTTP ${res.status}: ${body.slice(0, 200)}` };
  }
  return { delivered: true };
}

// Nur für Tests exportiert.
export const __telegramInternals = {
  deepLinkFor,
  LINK_TOKEN_TTL_MS,
};

// Silence unused import warnings for zod when no schemas below are added.
void z;
