// Liefert Identität des aktuell angemeldeten Nutzers: staff_id, organization_id, role.
// Geschützt: requireSupabaseAuth — darf nur aus Komponenten oder _authenticated-Loadern
// aufgerufen werden, nicht aus öffentlichen Route-Loadern (sonst 401 im SSR).

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Identity = {
  staffId: string | null;
  organizationId: string | null;
  role: "admin" | "manager" | "staff" | null;
  displayName: string | null;
};

export const getMyIdentity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Identity> => {
    const { data: link, error: linkErr } = await context.supabase
      .from("user_links")
      .select("staff_id, organization_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (linkErr || !link) {
      return { staffId: null, organizationId: null, role: null, displayName: null };
    }

    const { data: role } = await context.supabase
      .from("role_assignments")
      .select("role")
      .eq("staff_id", link.staff_id)
      .eq("organization_id", link.organization_id)
      .maybeSingle();

    const { data: staff } = await context.supabase
      .from("staff")
      .select("display_name, first_name, last_name")
      .eq("id", link.staff_id)
      .maybeSingle();

    const displayName =
      staff?.display_name?.trim() ||
      [staff?.first_name, staff?.last_name].filter(Boolean).join(" ").trim() ||
      null;

    return {
      staffId: link.staff_id,
      organizationId: link.organization_id,
      role: (role?.role as Identity["role"]) ?? null,
      displayName,
    };
  });
