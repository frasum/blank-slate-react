// Badge-Token-Verwaltung (B1c). Admin stellt Badges aus, widerruft sie
// oder listet Metadaten. Der Klartext-Token verlässt den Server NUR
// einmal — direkt nach Erstellung als Response von `issueBadge`. Er
// landet weder im audit_log noch in nachfolgenden Reads.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "./admin-context";
import { runGuarded } from "./admin-call";
import { makeAuditWriter } from "./audit";
import { generateBadgeToken } from "./token-generator";

export const listBadges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ staffId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("access_tokens")
      .select("id, created_at, expires_at, used_at")
      .eq("organization_id", caller.organizationId)
      .eq("staff_id", data.staffId)
      .eq("token_type", "badge_login")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (rows ?? []).map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      revokedAt: r.used_at,
    }));
  });

export const issueBadge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        staffId: z.string().uuid(),
        expiresAt: z.string().datetime().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const token = generateBadgeToken();
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: row, error } = await supabaseAdmin
        .from("access_tokens")
        .insert({
          organization_id: caller.organizationId,
          staff_id: data.staffId,
          token_type: "badge_login",
          token,
          expires_at: data.expiresAt ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return {
        // Klartext-Token NUR hier zurückgeben. Niemals loggen.
        result: { id: row.id, token },
        audit: {
          action: "badge.issue",
          entity: "access_token",
          entityId: row.id,
          meta: { staffId: data.staffId, expiresAt: data.expiresAt ?? null },
        },
      };
    });
  });

export const revokeBadge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ tokenId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin
        .from("access_tokens")
        .update({ used_at: new Date().toISOString() })
        .eq("id", data.tokenId)
        .eq("organization_id", caller.organizationId)
        .is("used_at", null);
      if (error) throw error;
      return {
        result: { ok: true as const },
        audit: { action: "badge.revoke", entity: "access_token", entityId: data.tokenId },
      };
    });
  });
