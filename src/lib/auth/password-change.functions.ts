// Server-Function für den Abschluss des Passwort-Wechsels.
//
// Aufrufer ist der eingeloggte Nutzer selbst. Wir prüfen über
// requireSupabaseAuth, dass die Session gültig ist (Bearer-Token wurde
// serverseitig revalidiert) — der eigentliche Passwortwechsel passiert
// vorher im Client via supabase.auth.updateUser({ password }). Diese
// Function setzt anschließend must_change_password=false auf dem
// zugehörigen staff-Record und schreibt einen Audit-Eintrag.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeAuditLog } from "@/lib/admin/audit";

export const markPasswordChanged = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: link, error: linkErr } = await supabaseAdmin
      .from("user_links")
      .select("staff_id, organization_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (linkErr) throw linkErr;
    if (!link) throw new Error("Kein Mitarbeiter-Profil verknüpft.");

    const { error: updErr } = await supabaseAdmin
      .from("staff")
      .update({ must_change_password: false })
      .eq("id", link.staff_id);
    if (updErr) throw updErr;

    await writeAuditLog({
      organizationId: link.organization_id,
      actorUserId: context.userId,
      actorStaffId: link.staff_id,
      action: "staff.password_changed",
      entity: "staff",
      entityId: link.staff_id,
    });

    return { ok: true as const };
  });