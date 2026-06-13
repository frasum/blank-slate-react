// Testbarer Kern für „Fehlende Staff anlegen".
//
// Verhalten:
//   - Iteriert über alle staff_identity_map-Einträge der Quelle ohne staff_id.
//   - Existiert in derselben Organisation bereits ein Staff mit identischem
//     display_name (case-insensitive, getrimmt), wird das Mapping mit diesem
//     Staff verknüpft — KEIN Neueintrag. Verhindert Duplikate bei Retry
//     nach Teilfehler.
//   - Andernfalls wird ein neuer Staff angelegt (display_name = alt_name,
//     is_active = true, ohne Rolle/PIN).
//   - Leere/whitespace-only alt_name werden übersprungen und mit Grund
//     `empty_alt_name` in skippedNames vermerkt.
//
// Idempotent: das UPDATE prüft erneut `staff_id IS NULL`, doppelter Aufruf
// erzeugt keine Duplikate.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { SourceSystem } from "./normalize";

export type BootstrapSkip = {
  altId: string;
  altName: string;
  reason: "empty_alt_name";
};

export type BootstrapResult = {
  created: number;
  linked: number;
  skipped: number;
  skippedNames: BootstrapSkip[];
};

export async function bootstrapMissingStaffCore(args: {
  admin: SupabaseClient<Database>;
  organizationId: string;
  sourceSystem: SourceSystem;
}): Promise<BootstrapResult> {
  const { admin, organizationId, sourceSystem } = args;

  const { data: openMappings, error: mapErr } = await admin
    .from("staff_identity_map")
    .select("id, alt_id, alt_name")
    .eq("organization_id", organizationId)
    .eq("source_system", sourceSystem)
    .is("staff_id", null);
  if (mapErr) throw mapErr;

  const { data: existingStaff, error: staffErr } = await admin
    .from("staff")
    .select("id, display_name")
    .eq("organization_id", organizationId);
  if (staffErr) throw staffErr;
  const byDisplayName = new Map<string, string>();
  for (const s of existingStaff ?? []) {
    if (s.display_name) byDisplayName.set(s.display_name.trim().toLowerCase(), s.id);
  }

  let created = 0;
  let linked = 0;
  let skipped = 0;
  const skippedNames: BootstrapSkip[] = [];

  for (const m of openMappings ?? []) {
    const name = (m.alt_name ?? "").trim();
    if (!name) {
      skipped++;
      skippedNames.push({
        altId: m.alt_id,
        altName: m.alt_name ?? "",
        reason: "empty_alt_name",
      });
      continue;
    }
    let staffId: string;
    const existingId = byDisplayName.get(name.toLowerCase());
    if (existingId) {
      staffId = existingId;
      linked++;
    } else {
      const parts = name.split(/\s+/);
      const lastName = parts.length > 1 ? parts[parts.length - 1] : name;
      const firstName = parts.length > 1 ? parts.slice(0, -1).join(" ") : name;
      const { data: newStaff, error: insErr } = await admin
        .from("staff")
        .insert({
          organization_id: organizationId,
          first_name: firstName,
          last_name: lastName,
          display_name: name,
          is_active: true,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      staffId = newStaff.id;
      byDisplayName.set(name.toLowerCase(), staffId);
      created++;
    }
    const { error: updErr } = await admin
      .from("staff_identity_map")
      .update({ staff_id: staffId })
      .eq("id", m.id)
      .eq("organization_id", organizationId)
      .is("staff_id", null);
    if (updErr) throw updErr;
  }

  return { created, linked, skipped, skippedNames };
}
