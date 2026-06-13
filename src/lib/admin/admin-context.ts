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
import { assertMinRole, ForbiddenError, type AppRole } from "./role-guard";

export type AdminCaller = {
  userId: string;
  staffId: string;
  organizationId: string;
  role: AppRole;
};

export async function loadAdminCaller(
  supabase: SupabaseClient<Database>,
  userId: string,
  minRole: AppRole,
): Promise<AdminCaller> {
  const { data: link, error: linkErr } = await supabase
    .from("user_links")
    .select("staff_id, organization_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (linkErr || !link) throw new ForbiddenError();

  const { data: roleRow, error: roleErr } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("staff_id", link.staff_id)
    .eq("organization_id", link.organization_id)
    .maybeSingle();
  if (roleErr) throw new ForbiddenError();

  const role = (roleRow?.role as AppRole | undefined) ?? null;
  assertMinRole(role, minRole);

  return {
    userId,
    staffId: link.staff_id,
    organizationId: link.organization_id,
    role: role!,
  };
}
