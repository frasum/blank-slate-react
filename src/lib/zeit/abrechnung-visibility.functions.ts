import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadStaffCaller } from "@/lib/time/time.functions";

// Sichtbarkeits-Gate für die „Abrechnung"-Kachel im /zeit-Hub.
// Sichtbar wenn: (a) Rolle admin/manager ODER (b) mindestens eine
// roster_shifts-Zeile mit area='service' existiert (auch Küchen-Kräfte,
// die zusätzlich Service machen können). Server-Guard (ensureMyOpenSession)
// bleibt die harte Grenze — dies hier ist reine UI-Kosmetik.
export const canSeeAbrechnungTile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await loadStaffCaller(context.supabase, context.userId);
    if (!caller.isActive) return { visible: false };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: roleRow } = await supabaseAdmin
      .from("role_assignments")
      .select("role")
      .eq("staff_id", caller.staffId)
      .eq("organization_id", caller.organizationId)
      .maybeSingle();
    const role = roleRow?.role ?? null;
    if (role === "admin" || role === "manager") return { visible: true };

    const { data: serviceShift } = await supabaseAdmin
      .from("roster_shifts")
      .select("id")
      .eq("staff_id", caller.staffId)
      .eq("organization_id", caller.organizationId)
      .eq("area", "service")
      .limit(1)
      .maybeSingle();

    return { visible: Boolean(serviceShift) };
  });
