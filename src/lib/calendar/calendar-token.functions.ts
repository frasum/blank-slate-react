// Self-Service für Kalender-Abo-Tokens. Der Klartext-Token verlässt den
// Server NUR in der Antwort von `getOrCreateMyCalendarToken` — nie im
// audit_log oder in Folgereads. staffId wird immer aus auth.uid via
// user_links abgeleitet, nie vom Client.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateBadgeToken } from "@/lib/admin/token-generator";

type CallerLink = { staffId: string; organizationId: string };

async function loadCallerLink(
  supabase: Parameters<typeof requireSupabaseAuth>[0] extends never
    ? never
    : Awaited<ReturnType<typeof requireSupabaseAuthContext>>["supabase"],
  userId: string,
): Promise<CallerLink> {
  const { data, error } = await supabase
    .from("user_links")
    .select("staff_id, organization_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) throw new Error("Kein Mitarbeiterprofil.");
  return { staffId: data.staff_id, organizationId: data.organization_id };
}

// Nur zur Typ-Extraktion des context.supabase — wird nie aufgerufen.
declare function requireSupabaseAuthContext(): {
  supabase: import("@supabase/supabase-js").SupabaseClient<
    import("@/integrations/supabase/types").Database
  >;
};

export const getOrCreateMyCalendarToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await loadCallerLink(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing, error: exErr } = await supabaseAdmin
      .from("access_tokens")
      .select("token")
      .eq("organization_id", caller.organizationId)
      .eq("staff_id", caller.staffId)
      .eq("token_type", "calendar_feed")
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (exErr) throw exErr;

    let token = existing?.token ?? null;
    if (!token) {
      const fresh = generateBadgeToken();
      const { error } = await supabaseAdmin.from("access_tokens").insert({
        organization_id: caller.organizationId,
        staff_id: caller.staffId,
        token_type: "calendar_feed",
        token: fresh,
        expires_at: null,
      });
      if (error) throw error;
      token = fresh;
    }
    return {
      token,
      feedPath: `/api/public/calendar/${token}.ics`,
    };
  });

export const revokeMyCalendarToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await loadCallerLink(context.supabase, context.userId);
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