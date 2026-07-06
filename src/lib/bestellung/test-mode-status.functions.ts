// TB1 — Status-Function für den Bestell-Testmodus.
//
// Liefert ausschließlich das Boolean `enabled` der aktuellen Caller-Org.
// Bewusst KEIN Admin-Gate (auch EasyOrder-Staff soll das Banner sehen) und
// bewusst OHNE Auslieferung der Test-E-Mail — die bleibt Admin-Wissen in
// /admin/einstellungen. Read-only, kein Audit.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OrderTestModeStatus = { enabled: boolean };

export const getOrderTestModeStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OrderTestModeStatus> => {
    // Org des Callers über user_links auflösen (RLS-safe: eigener Link).
    const { data: link } = await context.supabase
      .from("user_links")
      .select("organization_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!link?.organization_id) return { enabled: false };

    // Nur die eine Spalte lesen — Test-Adresse wird bewusst nicht ausgeliefert.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("organization_settings")
      .select("test_mode_enabled")
      .eq("organization_id", link.organization_id)
      .maybeSingle();
    return { enabled: Boolean(data?.test_mode_enabled ?? false) };
  });
