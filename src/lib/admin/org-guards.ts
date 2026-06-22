// Geteilte Org-Guards für Admin-Server-Functions. Lazy-Load von supabaseAdmin,
// damit der Service-Role-Client nicht ins Client-Bundle leakt.

export async function assertStaffInOrg(staffId: string, organizationId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("staff")
    .select("id")
    .eq("id", staffId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Mitarbeiter nicht in dieser Organisation.");
}