// IMP1b — Zentraler, vorschau-bewusster Staff-Caller.
//
// Analog zu loadAdminCaller (admin-context.ts): löst genau EINMAL pro Aufruf
// die aktive Admin-Vorschau (admin_impersonations) über
// resolveActiveImpersonation auf und liefert den effektiven staffId +
// impersonatedBy zurück. Defense-in-Depth-Guards:
//   1. Ziel-Staff existiert.
//   2. Ziel-Staff liegt in DERSELBEN Organisation wie der reale Admin.
//   3. Der reale Aufrufer besitzt eine admin-Rolle in dieser Organisation.
// Schreibpfade müssen zusätzlich assertRealIdentity(caller) rufen — der
// Vorschau-Modus ist strikt lesend.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { resolveActiveImpersonation } from "./impersonation";

export type StaffCaller = {
  userId: string;
  staffId: string;
  organizationId: string;
  isActive: boolean;
  // IMP1: Bei aktiver Admin-Vorschau ist staffId die des Ziel-Mitarbeiters;
  // impersonatedBy hält dann die staff_id des echten Admins. Sonst null.
  impersonatedBy: string | null;
};

export async function loadStaffCaller(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<StaffCaller> {
  const { data: link, error: linkErr } = await supabase
    .from("user_links")
    .select("staff_id, organization_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (linkErr || !link) {
    throw new Error("Kein Mitarbeiter-Profil verknüpft.");
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const imp = await resolveActiveImpersonation(supabase, userId);
  let effectiveStaffId = link.staff_id as string;
  const organizationId = link.organization_id as string;
  let impersonatedBy: string | null = null;
  if (imp) {
    const { data: adminRole } = await supabaseAdmin
      .from("role_assignments")
      .select("role")
      .eq("staff_id", link.staff_id)
      .eq("organization_id", link.organization_id)
      .maybeSingle();
    if ((adminRole?.role as string | undefined) !== "admin") {
      throw new Error("Vorschau nicht erlaubt (Aufrufer ist kein Admin).");
    }
    const { data: target } = await supabaseAdmin
      .from("staff")
      .select("id, organization_id")
      .eq("id", imp.targetStaffId)
      .maybeSingle();
    if (!target || target.organization_id !== link.organization_id) {
      throw new Error("Vorschau-Ziel ist nicht in derselben Organisation.");
    }
    effectiveStaffId = imp.targetStaffId;
    impersonatedBy = link.staff_id as string;
  }

  const { data: staff, error: staffErr } = await supabaseAdmin
    .from("staff")
    .select("is_active")
    .eq("id", effectiveStaffId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (staffErr || !staff) throw new Error("Mitarbeiter nicht gefunden.");
  return {
    userId,
    staffId: effectiveStaffId,
    organizationId,
    isActive: staff.is_active,
    impersonatedBy,
  };
}