// DB-Integrationstest für `importStaffAssignments` (Teil Y).
// Aktiv nur bei SUPABASE_DB_TESTS=1.
//
// Tests rufen das Core-Modul direkt mit dem service_role-Client auf.
// Role-guard (a) wird separat über die DENY-ALL-Realität geprüft (kein
// Manager-/Staff-Client kann staff_skills schreiben), sowie über die
// existierende Unit-Suite zu runGuarded/loadAdminCaller.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { dbTestsEnabled, seedOrg, signInAsUser, type SeededOrg } from "@/test/db-setup";
import { runImportAssignmentsCore } from "./import-assignments-core";

async function mkStaff(org: SeededOrg, displayName: string): Promise<string> {
  const { data, error } = await org.service
    .from("staff")
    .insert({
      organization_id: org.orgId,
      first_name: displayName,
      last_name: "Test",
      display_name: displayName,
      is_active: true,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`staff insert: ${error?.message}`);
  return data.id;
}

async function bindServicePlaceholder(
  org: SeededOrg,
  staffId: string,
  locationId: string,
): Promise<void> {
  const { error } = await org.service.from("staff_locations").insert({
    organization_id: org.orgId,
    staff_id: staffId,
    location_id: locationId,
    department: "service",
  });
  if (error && !error.message.includes("duplicate")) throw error;
}

async function addMapping(
  org: SeededOrg,
  altId: string,
  altName: string,
  staffId: string,
): Promise<void> {
  const { error } = await org.service.from("staff_identity_map").insert({
    organization_id: org.orgId,
    source_system: "tagesabrechnung",
    alt_id: altId,
    alt_name: altName,
    staff_id: staffId,
    confirmed_at: new Date().toISOString(),
  });
  if (error) throw error;
}

describe.skipIf(!dbTestsEnabled)("importStaffAssignments — DB (Teil Y)", () => {
  let org: SeededOrg;
  let spicery: string;
  let yum: string;
  const ALT_SPICERY = "alt-loc-spicery";
  const ALT_YUM = "alt-loc-yum";
  const altMap: Record<string, string> = {};

  beforeAll(async () => {
    org = await seedOrg("importY");
    spicery = org.defaultLocationId;
    yum = await org.mkLocation("YUM");
    altMap[ALT_SPICERY] = spicery;
    altMap[ALT_YUM] = yum;
  });

  afterAll(async () => {
    // Aufräumen vor dem Standard-Cleanup, damit FK-Cascade nicht klemmt.
    await org.service.from("staff_skills").delete().eq("organization_id", org.orgId);
    await org.cleanup();
  });

  it("(b) Mehrfachzuordnung kitchen an beiden Standorten", async () => {
    const appel = await mkStaff(org, "APPEL");
    await bindServicePlaceholder(org, appel, spicery);
    await addMapping(org, "alt-appel", "APPEL", appel);

    const r = await runImportAssignmentsCore({
      admin: org.service,
      organizationId: org.orgId,
      sourceSystem: "tagesabrechnung",
      assignments: [
        { altStaffId: "alt-appel", altLocationId: ALT_SPICERY, ztDepartment: "Küche" },
        { altStaffId: "alt-appel", altLocationId: ALT_YUM, ztDepartment: "Küche" },
      ],
      skills: [],
      skillsMode: "replace",
      mode: "commit",
      altLocationMap: altMap,
    });
    expect(r.plan.totals.locationsAdded).toBe(2);
    expect(r.plan.totals.locationsRemoved).toBe(1); // service-Platzhalter ersetzt

    const { data: rows } = await org.service
      .from("staff_locations")
      .select("location_id, department")
      .eq("staff_id", appel);
    expect((rows ?? []).map((r) => r.department).sort()).toEqual(["kitchen", "kitchen"]);
    expect(new Set((rows ?? []).map((r) => r.location_id))).toEqual(new Set([spicery, yum]));
  });

  it("(c) GL-Mitarbeiter landet als department='gl' und nicht im Pool-Filter", async () => {
    const chef = await mkStaff(org, "CHEFIN");
    await bindServicePlaceholder(org, chef, spicery);
    await addMapping(org, "alt-chef", "CHEFIN", chef);

    await runImportAssignmentsCore({
      admin: org.service,
      organizationId: org.orgId,
      sourceSystem: "tagesabrechnung",
      assignments: [{ altStaffId: "alt-chef", altLocationId: ALT_SPICERY, ztDepartment: "GL" }],
      skills: [],
      skillsMode: "replace",
      mode: "commit",
      altLocationMap: altMap,
    });

    const { data: rows } = await org.service
      .from("staff_locations")
      .select("department")
      .eq("staff_id", chef);
    expect((rows ?? []).map((r) => r.department)).toEqual(["gl"]);

    // Pool-Filter-Platzhalter: SELECT … WHERE department IN ('kitchen','service')
    const { data: poolRows } = await org.service
      .from("staff_locations")
      .select("staff_id")
      .eq("staff_id", chef)
      .in("department", ["kitchen", "service"]);
    expect(poolRows ?? []).toEqual([]);
  });

  it("(d) Platzhalter-Ersetzung erzeugt KEIN Doppel", async () => {
    const koch = await mkStaff(org, "KOCH-D");
    await bindServicePlaceholder(org, koch, spicery);
    await addMapping(org, "alt-koch-d", "KOCH-D", koch);

    await runImportAssignmentsCore({
      admin: org.service,
      organizationId: org.orgId,
      sourceSystem: "tagesabrechnung",
      assignments: [
        { altStaffId: "alt-koch-d", altLocationId: ALT_SPICERY, ztDepartment: "Küche" },
      ],
      skills: [],
      skillsMode: "replace",
      mode: "commit",
      altLocationMap: altMap,
    });
    const { data } = await org.service
      .from("staff_locations")
      .select("department")
      .eq("staff_id", koch);
    expect((data ?? []).map((r) => r.department)).toEqual(["kitchen"]);
  });

  it("(e) Idempotenz: zweiter Commit = 0 Ops", async () => {
    const k = await mkStaff(org, "KOCH-E");
    await addMapping(org, "alt-koch-e", "KOCH-E", k);
    const args = {
      admin: org.service,
      organizationId: org.orgId,
      sourceSystem: "tagesabrechnung" as const,
      assignments: [
        { altStaffId: "alt-koch-e", altLocationId: ALT_SPICERY, ztDepartment: "Küche" as const },
      ],
      skills: [{ altStaffId: "alt-koch-e", skillName: "VS" }],
      skillsMode: "replace" as const,
      altLocationMap: altMap,
    };
    const first = await runImportAssignmentsCore({ ...args, mode: "commit" });
    expect(first.plan.totals.locationsAdded + first.plan.totals.skillsAdded).toBeGreaterThan(0);
    const second = await runImportAssignmentsCore({ ...args, mode: "commit" });
    expect(second.plan.totals.locationsAdded).toBe(0);
    expect(second.plan.totals.locationsRemoved).toBe(0);
    expect(second.plan.totals.skillsAdded).toBe(0);
    expect(second.plan.totals.skillsRemoved).toBe(0);
  });

  it("(f) Dry-Run schreibt nichts", async () => {
    const k = await mkStaff(org, "KOCH-F");
    await addMapping(org, "alt-koch-f", "KOCH-F", k);

    const before = await org.service
      .from("staff_locations")
      .select("id", { count: "exact", head: true })
      .eq("staff_id", k);
    const r = await runImportAssignmentsCore({
      admin: org.service,
      organizationId: org.orgId,
      sourceSystem: "tagesabrechnung",
      assignments: [
        { altStaffId: "alt-koch-f", altLocationId: ALT_SPICERY, ztDepartment: "Küche" },
      ],
      skills: [{ altStaffId: "alt-koch-f", skillName: "PASS" }],
      skillsMode: "replace",
      mode: "dry_run",
      altLocationMap: altMap,
    });
    expect(r.plan.totals.locationsAdded).toBe(1);
    expect(r.plan.totals.skillsAdded).toBe(1);
    const after = await org.service
      .from("staff_locations")
      .select("id", { count: "exact", head: true })
      .eq("staff_id", k);
    expect(after.count).toBe(before.count);
  });

  it("(g) Unbekannte alt-IDs/Skills landen in skippedRows ohne den Rest zu blockieren", async () => {
    const k = await mkStaff(org, "KOCH-G");
    await addMapping(org, "alt-koch-g", "KOCH-G", k);
    const r = await runImportAssignmentsCore({
      admin: org.service,
      organizationId: org.orgId,
      sourceSystem: "tagesabrechnung",
      assignments: [
        { altStaffId: "alt-koch-g", altLocationId: ALT_SPICERY, ztDepartment: "Küche" },
        { altStaffId: "alt-unknown", altLocationId: ALT_SPICERY, ztDepartment: "Küche" },
        { altStaffId: "alt-koch-g", altLocationId: "alt-unknown-loc", ztDepartment: "Küche" },
      ],
      skills: [
        { altStaffId: "alt-koch-g", skillName: "VS" },
        { altStaffId: "alt-koch-g", skillName: "DOESNT-EXIST" },
      ],
      skillsMode: "replace",
      mode: "commit",
      altLocationMap: altMap,
    });
    expect(r.plan.totals.locationsAdded).toBe(1);
    expect(r.plan.totals.skillsAdded).toBe(1);
    const reasons = r.plan.skippedRows.map((s) => s.reason).sort();
    expect(reasons).toEqual(["unknown_alt_staff", "unknown_location", "unknown_skill"]);
  });

  it("(a) Role-guard: Manager kann staff_skills nicht direkt schreiben (DENY-ALL)", async () => {
    const manager = await org.mkUser("manager");
    const mgrClient = await signInAsUser(manager.email, manager.password);
    const { data: skill } = await org.service
      .from("skills")
      .select("id")
      .eq("organization_id", org.orgId)
      .eq("name", "VS")
      .single();
    expect(skill).toBeTruthy();
    const { error } = await mgrClient.from("staff_skills").insert({
      organization_id: org.orgId,
      staff_id: manager.staffId,
      skill_id: skill!.id,
    });
    expect(error).not.toBeNull();

    // SELECT in eigener Org darf der Manager.
    const { error: selErr } = await mgrClient
      .from("skills")
      .select("id")
      .eq("organization_id", org.orgId);
    expect(selErr).toBeNull();
  });
});
