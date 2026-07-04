// Lädt den Aufruferkontext (staff_id, organization_id, role) aus user_links
// und role_assignments — über den authentifizierten Supabase-Client, sodass
// RLS greift. assertMinRole-Aufruf am Ende stellt sicher, dass der Aufrufer
// die Mindestrolle erfüllt; sonst ForbiddenError.
//
// Wird in jeder geschützten Admin-/Manager-Server-Function als ERSTES
// aufgerufen. Schreibt KEIN audit_log (das macht der jeweilige Wrapper im
// Erfolgsfall).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { assertMinRole, assertRoleAllowed, ForbiddenError, type AppRole } from "./role-guard";
import { resolveActiveImpersonation } from "./impersonation";

export type AdminCaller = {
  userId: string;
  staffId: string;
  organizationId: string;
  role: AppRole;
  // IMP1: Bei aktiver Admin-Vorschau ist staffId/role die des Ziel-Mitarbeiters;
  // impersonatedBy hält dann die staff_id des echten Admins. Sonst null/undefined.
  impersonatedBy?: string | null;
};

export async function loadAdminCaller(
  supabase: SupabaseClient<Database>,
  userId: string,
  minRoleOrAllowed: AppRole | readonly AppRole[],
): Promise<AdminCaller> {
  const { data: link, error: linkErr } = await supabase
    .from("user_links")
    .select("staff_id, organization_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (linkErr || !link) throw new ForbiddenError();

  // Role-Lookup läuft über den Admin-Client, weil die RLS auf role_assignments
  // während einer aktiven Impersonation (current_staff_id() zeigt auf das
  // Vorschau-Ziel) das eigene Role-Row des Admins ausblendet und sonst jede
  // loadAdminCaller-Fn im Vorschau-Modus fälschlich Forbidden werfen würde.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // IMP1: Aktive Vorschau des echten Admins auflösen. Guards analog
  // loadStaffCaller: Ziel muss existieren und in derselben Organisation liegen,
  // Aufrufer muss real admin sein.
  const imp = await resolveActiveImpersonation(supabase, userId);
  let effectiveStaffId = link.staff_id as string;
  let impersonatedBy: string | null = null;
  if (imp) {
    const { data: adminRole } = await supabaseAdmin
      .from("role_assignments")
      .select("role")
      .eq("staff_id", link.staff_id)
      .eq("organization_id", link.organization_id)
      .maybeSingle();
    if ((adminRole?.role as string | undefined) !== "admin") {
      throw new ForbiddenError();
    }
    const { data: target } = await supabaseAdmin
      .from("staff")
      .select("id, organization_id")
      .eq("id", imp.targetStaffId)
      .maybeSingle();
    if (!target || target.organization_id !== link.organization_id) {
      throw new ForbiddenError();
    }
    effectiveStaffId = imp.targetStaffId;
    impersonatedBy = link.staff_id as string;
  }

  const { data: roleRow, error: roleErr } = await supabaseAdmin
    .from("role_assignments")
    .select("role")
    .eq("staff_id", effectiveStaffId)
    .eq("organization_id", link.organization_id)
    .maybeSingle();
  if (roleErr) throw new ForbiddenError();

  const role = (roleRow?.role as AppRole | undefined) ?? null;
  if (Array.isArray(minRoleOrAllowed)) {
    assertRoleAllowed(role, minRoleOrAllowed);
  } else {
    assertMinRole(role, minRoleOrAllowed as AppRole);
  }

  return {
    userId,
    staffId: effectiveStaffId,
    organizationId: link.organization_id,
    role: role!,
    impersonatedBy,
  };
}
