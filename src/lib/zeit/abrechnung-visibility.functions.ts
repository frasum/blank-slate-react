import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadStaffCaller } from "@/lib/time/time.functions";

// Sichtbarkeits-Gate für die „Abrechnung"-Kachel im /zeit-Hub.
// Deckungsgleich mit ensureMyOpenSession: sichtbar genau dann, wenn heute
// eine Session eröffnet werden dürfte (admin/manager mit eindeutigem
// Standort, oder staff mit Service-Schicht am zugeordneten Standort).
export const canSeeAbrechnungTile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await loadStaffCaller(context.supabase, context.userId);
    if (!caller.isActive) return { visible: false };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolveMySessionLocation } = await import("@/lib/cash/session-location.server");
    const { data: bd, error: bdErr } = await supabaseAdmin.rpc("current_business_date");
    if (bdErr || !bd) return { visible: false };
    const businessDate = bd as unknown as string;
    const resolved = await resolveMySessionLocation(
      supabaseAdmin,
      { staffId: caller.staffId, organizationId: caller.organizationId },
      businessDate,
    );
    return { visible: resolved.ok };
  });
