// I/O-Kern für `importStaffAssignments`. Liest Auflösungs-Tabellen mit dem
// übergebenen Admin-Client (service_role), berechnet den Diff via reinem
// `computeAssignmentPlan` und schreibt im Commit-Pfad in `staff_locations`
// / `staff_skills`. Schreibt selbst KEIN audit_log — das übernimmt der
// Server-Fn-Handler über `runGuarded`. So bleibt das Modul vollständig
// DB-getestet, ohne den Auth-/HTTP-Stack zu mocken.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  computeAssignmentPlan,
  type AssignmentInput,
  type ComputePlanResult,
  type CurrentLocationRow,
  type CurrentSkillRow,
  type SkillInput,
  type SkillsMode,
} from "./import-assignments";

/** Feste Alt→Neu Location-Map (verifizierte Grundlage aus dem Plan). */
export const ALT_LOCATION_MAP: Record<string, string> = {
  // Spicery
  "a1710390-ea4d-4bc2-b869-c0c047056b15": "44a99e7e-93be-44b1-89ab-38e364a02ddc",
  // YUM
  "3065f458-6d66-4a5d-a85e-f8ee33bb7351": "14c2d773-6c5f-4a24-ba00-1c726f277091",
};

export type ImportCoreInput = {
  admin: SupabaseClient<Database>;
  organizationId: string;
  sourceSystem: "tagesabrechnung";
  assignments: AssignmentInput[];
  skills: SkillInput[];
  skillsMode: SkillsMode;
  mode: "dry_run" | "commit";
  /** Optional: überschreibt die feste Map (für Tests). */
  altLocationMap?: Record<string, string>;
};

export type ImportCoreResult = {
  mode: "dry_run" | "commit";
  plan: ComputePlanResult;
};

export async function runImportAssignmentsCore(input: ImportCoreInput): Promise<ImportCoreResult> {
  const { admin, organizationId } = input;

  const { data: mapRows, error: mapErr } = await admin
    .from("staff_identity_map")
    .select("alt_id, staff_id, confirmed_at")
    .eq("organization_id", organizationId)
    .eq("source_system", input.sourceSystem);
  if (mapErr) throw mapErr;
  const staffMap = new Map<string, string>();
  for (const r of mapRows ?? []) {
    if (!r.confirmed_at || !r.staff_id) continue;
    staffMap.set(r.alt_id, r.staff_id);
  }

  const altLoc = input.altLocationMap ?? ALT_LOCATION_MAP;
  const { data: locRows, error: locErr } = await admin
    // ST1: bewusst ungefiltert — Daten-Zugriff (Import-Zuordnung Alt-ID → Standort).
    .from("locations")
    .select("id")
    .eq("organization_id", organizationId);
  if (locErr) throw locErr;
  const validLocIds = new Set((locRows ?? []).map((r) => r.id));
  const locationMap = new Map<string, string>();
  for (const [altId, locId] of Object.entries(altLoc)) {
    if (validLocIds.has(locId)) locationMap.set(altId, locId);
  }

  const { data: skillRows, error: skillErr } = await admin
    .from("skills")
    .select("id, name")
    .eq("organization_id", organizationId);
  if (skillErr) throw skillErr;
  const skillMap = new Map<string, string>();
  for (const r of skillRows ?? []) skillMap.set(r.name, r.id);

  const staffIds = Array.from(new Set(Array.from(staffMap.values())));
  let currentLocations: CurrentLocationRow[] = [];
  let currentSkills: CurrentSkillRow[] = [];
  if (staffIds.length > 0) {
    const { data: slRows, error: slErr } = await admin
      .from("staff_locations")
      .select("staff_id, location_id, department")
      .eq("organization_id", organizationId)
      .in("staff_id", staffIds);
    if (slErr) throw slErr;
    currentLocations = (slRows ?? []).map((r) => ({
      staffId: r.staff_id,
      locationId: r.location_id,
      department: r.department,
    }));

    const { data: ssRows, error: ssErr } = await admin
      .from("staff_skills")
      .select("staff_id, skill_id")
      .eq("organization_id", organizationId)
      .in("staff_id", staffIds);
    if (ssErr) throw ssErr;
    currentSkills = (ssRows ?? []).map((r) => ({
      staffId: r.staff_id,
      skillId: r.skill_id,
    }));
  }

  const plan = computeAssignmentPlan({
    assignments: input.assignments,
    skills: input.skills,
    staffMap,
    locationMap,
    skillMap,
    currentLocations,
    currentSkills,
    skillsMode: input.skillsMode,
  });

  if (input.mode === "dry_run") {
    return { mode: "dry_run", plan };
  }

  // Commit: Adds vor Removes (Unique-Reibung vermeiden).
  const adds = plan.locationOps.filter((o) => o.op === "add");
  if (adds.length > 0) {
    const { error: addErr } = await admin.from("staff_locations").insert(
      adds.map((o) => ({
        organization_id: organizationId,
        staff_id: o.staffId,
        location_id: o.locationId,
        department: o.department,
      })),
    );
    if (addErr) throw new Error(`staff_locations insert failed: ${addErr.message}`);
  }
  for (const o of plan.locationOps) {
    if (o.op !== "remove") continue;
    const { error: rmErr } = await admin
      .from("staff_locations")
      .delete()
      .eq("organization_id", organizationId)
      .eq("staff_id", o.staffId)
      .eq("location_id", o.locationId)
      .eq("department", o.department);
    if (rmErr) throw new Error(`staff_locations delete failed: ${rmErr.message}`);
  }

  const skillAdds = plan.skillOps.filter((o) => o.op === "add");
  if (skillAdds.length > 0) {
    const { error: addErr } = await admin.from("staff_skills").insert(
      skillAdds.map((o) => ({
        organization_id: organizationId,
        staff_id: o.staffId,
        skill_id: o.skillId,
      })),
    );
    if (addErr) throw new Error(`staff_skills insert failed: ${addErr.message}`);
  }
  for (const o of plan.skillOps) {
    if (o.op !== "remove") continue;
    const { error: rmErr } = await admin
      .from("staff_skills")
      .delete()
      .eq("organization_id", organizationId)
      .eq("staff_id", o.staffId)
      .eq("skill_id", o.skillId);
    if (rmErr) throw new Error(`staff_skills delete failed: ${rmErr.message}`);
  }

  return { mode: "commit", plan };
}
