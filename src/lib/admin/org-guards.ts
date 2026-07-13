// Geteilte Org-Guards für Admin-Server-Functions. Lazy-Load von supabaseAdmin,
// damit der Service-Role-Client nicht ins Client-Bundle leakt.

import { expectMaybe } from "@/lib/supabase/expect-ok";

export async function assertStaffInOrg(staffId: string, organizationId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const row = expectMaybe<{ id: string }>(
    await supabaseAdmin
      .from("staff")
      .select("id")
      .eq("id", staffId)
      .eq("organization_id", organizationId)
      .maybeSingle(),
    "assertStaffInOrg",
  );
  if (!row) throw new Error("Mitarbeiter nicht in dieser Organisation.");
}
