// Self-Service für Kalender-Abo-Tokens. Der Klartext-Token verlässt den
// Server nur ONE-SHOT (bei Neu-Erzeugung) — in der DB liegt ausschließlich
// der SHA-256-Hash (`token_hash`). Bestehende Tokens können nicht wieder
// angezeigt werden; wer die URL verloren hat, muss neu erzeugen (revoke +
// create). staffId wird immer über loadStaffCaller abgeleitet, nie vom
// Client. Alle Mutationen tragen assertRealIdentity als erste Zeile.

import { createServerFn } from "@tanstack/react-start";
import { createHash } from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateBadgeToken } from "@/lib/admin/token-generator";
import { loadStaffCaller } from "@/lib/time/time.functions";
import { assertRealIdentity } from "@/lib/admin/impersonation";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

// Prüft, ob bereits ein aktives Kalender-Feed-Token existiert. Klartext
// wird nie mehr geliefert.
export const getMyCalendarTokenStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ hasActive: boolean }> => {
    const caller = await loadStaffCaller(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("access_tokens")
      .select("id")
      .eq("organization_id", caller.organizationId)
      .eq("staff_id", caller.staffId)
      .eq("token_type", "calendar_feed")
      .is("used_at", null)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return { hasActive: !!data };
  });

// Legt einen frischen Feed-Token an (nach Bedarf werden vorhandene
// zuvor stillgelegt) und liefert Klartext + Feed-Pfad einmalig zurück.
export const rotateMyCalendarToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ context }): Promise<{ token: string; feedPath: string }> => {
      const caller = await loadStaffCaller(context.supabase, context.userId);
      assertRealIdentity(caller);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      // Alte aktive Tokens stilllegen (used_at setzen).
      const { error: revokeErr } = await supabaseAdmin
        .from("access_tokens")
        .update({ used_at: new Date().toISOString() })
        .eq("organization_id", caller.organizationId)
        .eq("staff_id", caller.staffId)
        .eq("token_type", "calendar_feed")
        .is("used_at", null);
      if (revokeErr) throw revokeErr;

      const fresh = generateBadgeToken();
      const { error } = await supabaseAdmin.from("access_tokens").insert({
        organization_id: caller.organizationId,
        staff_id: caller.staffId,
        token_type: "calendar_feed",
        token_hash: sha256Hex(fresh),
        expires_at: null,
      });
      if (error) throw error;
      return { token: fresh, feedPath: `/api/public/calendar/${fresh}.ics` };
    },
  );

export const revokeMyCalendarToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await loadStaffCaller(context.supabase, context.userId);
    assertRealIdentity(caller);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("access_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("organization_id", caller.organizationId)
      .eq("staff_id", caller.staffId)
      .eq("token_type", "calendar_feed")
      .is("used_at", null);
    if (error) throw error;
    return { ok: true as const };
  });
