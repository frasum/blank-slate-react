// Liefert Identität des aktuell angemeldeten Nutzers: staff_id, organization_id, role.
// Geschützt: requireSupabaseAuth — darf nur aus Komponenten oder _authenticated-Loadern
// aufgerufen werden, nicht aus öffentlichen Route-Loadern (sonst 401 im SSR).

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Identity = {
  staffId: string | null;
  organizationId: string | null;
  role: "admin" | "manager" | "staff" | "payroll" | null;
  displayName: string | null;
  mustChangePassword: boolean;
  impersonation: {
    active: boolean;
    asStaffId: string | null;
    asDisplayName: string | null;
    since: string | null;
  };
};

export const getMyIdentity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Identity> => {
    // Aktive Impersonation des AUFRUFENDEN Admins (geht über auth.uid()
    // direkt, nicht über die effektiven Helfer).
    const { data: imp } = await context.supabase
      .from("admin_impersonations")
      .select("target_staff_id, started_at")
      .eq("admin_user_id", context.userId)
      .is("ended_at", null)
      .maybeSingle();

    const { data: link, error: linkErr } = await context.supabase
      .from("user_links")
      .select("staff_id, organization_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (linkErr || !link) {
      return {
        staffId: null,
        organizationId: null,
        role: null,
        displayName: null,
        mustChangePassword: false,
        impersonation: { active: false, asStaffId: null, asDisplayName: null, since: null },
      };
    }

    // Effektive Identität: bei Impersonation zeigt sie auf den Ziel-Mitarbeiter
    // (Helfer current_staff_id/current_role lösen das automatisch auf), sonst
    // auf den eingeloggten Mitarbeiter. So spiegelt das UI die effektive Rolle.
    const effectiveStaffId = imp?.target_staff_id ?? link.staff_id;

    const { data: role } = await context.supabase
      .from("role_assignments")
      .select("role")
      .eq("staff_id", effectiveStaffId)
      .eq("organization_id", link.organization_id)
      .maybeSingle();

    const { data: staff } = await context.supabase
      .from("staff")
      .select("display_name, first_name, last_name, must_change_password")
      .eq("id", effectiveStaffId)
      .maybeSingle();

    const displayName =
      staff?.display_name?.trim() ||
      [staff?.first_name, staff?.last_name].filter(Boolean).join(" ").trim() ||
      null;

    return {
      staffId: effectiveStaffId,
      organizationId: link.organization_id,
      role: (role?.role as Identity["role"]) ?? null,
      displayName,
      mustChangePassword: staff?.must_change_password ?? false,
      impersonation: imp
        ? {
            active: true,
            asStaffId: imp.target_staff_id,
            asDisplayName: displayName,
            since: imp.started_at,
          }
        : { active: false, asStaffId: null, asDisplayName: null, since: null },
    };
  });
