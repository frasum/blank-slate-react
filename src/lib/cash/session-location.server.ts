// Server-Helper: sammelt die DB-Inputs für resolveSessionLocation.
// Wird von ensureMyOpenSession und canSeeAbrechnungTile geteilt, damit
// die Kachel-Sichtbarkeit und die tatsächliche Eröffnungs-Regel nicht
// auseinanderlaufen.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { resolveSessionLocation, type ResolveSessionLocation } from "./session-location";

export async function resolveMySessionLocation(
  supabaseAdmin: SupabaseClient<Database>,
  caller: { staffId: string; organizationId: string },
  businessDate: string,
): Promise<ResolveSessionLocation> {
  const { data: roleRow } = await supabaseAdmin
    .from("role_assignments")
    .select("role")
    .eq("staff_id", caller.staffId)
    .eq("organization_id", caller.organizationId)
    .maybeSingle();
  const role = roleRow?.role ?? null;
  const isPrivileged = role === "admin" || role === "manager";

  const { data: rows, error: locErr } = await supabaseAdmin
    .from("staff_locations")
    .select("location_id")
    .eq("organization_id", caller.organizationId)
    .eq("staff_id", caller.staffId);
  if (locErr) throw locErr;
  const assignedLocationIds = [...new Set((rows ?? []).map((r) => r.location_id))];

  let serviceShiftLocationIds: string[] = [];
  if (!isPrivileged) {
    const { data: shifts, error: shiftErr } = await supabaseAdmin
      .from("roster_shifts")
      .select("location_id")
      .eq("organization_id", caller.organizationId)
      .eq("staff_id", caller.staffId)
      .eq("shift_date", businessDate)
      .eq("area", "service");
    if (shiftErr) throw shiftErr;
    serviceShiftLocationIds = [...new Set((shifts ?? []).map((s) => s.location_id))];
  }

  return resolveSessionLocation({
    isPrivileged,
    assignedLocationIds,
    serviceShiftLocationIds,
  });
}