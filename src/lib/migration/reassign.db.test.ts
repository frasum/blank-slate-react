// DB-Integrationstest für reassignImportedStaffCore.
// Läuft nur in CI mit lokalem Supabase-Stack (SUPABASE_DB_TESTS=1).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { dbTestsEnabled, seedOrg, type SeededOrg } from "@/test/db-setup";
import { reassignImportedStaffCore } from "./reassign-imported-staff";

async function mkStaff(org: SeededOrg, displayName: string): Promise<string> {
  const { data, error } = await org.service
    .from("staff")
    .insert({
      organization_id: org.orgId,
      first_name: displayName,
      last_name: "X",
      display_name: displayName,
      is_active: true,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`staff insert: ${error?.message}`);
  return data.id;
}

describe.skipIf(!dbTestsEnabled)("reassignImportedStaffCore — DB", () => {
  let org: SeededOrg;
  let wrongStaffId: string;
  let realA: string;
  let realB: string;

  beforeAll(async () => {
    org = await seedOrg("reassign");
    wrongStaffId = await mkStaff(org, "Admin-Proxy");
    realA = await mkStaff(org, "JASMIN");
    realB = await mkStaff(org, "LAM");

    // Confirmed mappings → korrekte Zuordnung.
    const { error: mapErr } = await org.service.from("staff_identity_map").insert([
      {
        organization_id: org.orgId,
        source_system: "tagesabrechnung",
        alt_id: "JAS-1",
        alt_name: "JASMIN",
        staff_id: realA,
        confirmed_at: new Date().toISOString(),
      },
      {
        organization_id: org.orgId,
        source_system: "tagesabrechnung",
        alt_id: "LAM-1",
        alt_name: "LAM",
        staff_id: realB,
        confirmed_at: new Date().toISOString(),
      },
      // Unbestätigt — muss ignoriert werden.
      {
        organization_id: org.orgId,
        source_system: "tagesabrechnung",
        alt_id: "GHOST-1",
        alt_name: "GHOST",
        staff_id: realA,
      },
    ]);
    if (mapErr) throw mapErr;

    // 3 fehlzugeordnete Schichten (alle auf Admin-Proxy), 1 korrekt zugeordnete.
    const base = new Date("2025-01-10T18:00:00.000Z");
    const rows = [
      {
        organization_id: org.orgId,
        staff_id: wrongStaffId,
        started_at: new Date(base.getTime()).toISOString(),
        ended_at: new Date(base.getTime() + 4 * 3600_000).toISOString(),
        business_date: "2025-01-10",
        source: "import" as const,
        import_key: "tagesabrechnung:JAS-1:2025-01-10",
        break_minutes: 0,
      },
      {
        organization_id: org.orgId,
        staff_id: wrongStaffId,
        started_at: new Date(base.getTime() + 24 * 3600_000).toISOString(),
        ended_at: new Date(base.getTime() + 28 * 3600_000).toISOString(),
        business_date: "2025-01-11",
        source: "import" as const,
        import_key: "tagesabrechnung:JAS-1:2025-01-11",
        break_minutes: 0,
      },
      {
        organization_id: org.orgId,
        staff_id: wrongStaffId,
        started_at: new Date(base.getTime() + 48 * 3600_000).toISOString(),
        ended_at: new Date(base.getTime() + 52 * 3600_000).toISOString(),
        business_date: "2025-01-12",
        source: "import" as const,
        import_key: "tagesabrechnung:LAM-1:2025-01-12",
        break_minutes: 0,
      },
      // Bereits korrekt — darf nicht angefasst werden.
      {
        organization_id: org.orgId,
        staff_id: realA,
        started_at: new Date(base.getTime() + 72 * 3600_000).toISOString(),
        ended_at: new Date(base.getTime() + 76 * 3600_000).toISOString(),
        business_date: "2025-01-13",
        source: "import" as const,
        import_key: "tagesabrechnung:JAS-1:2025-01-13",
        break_minutes: 0,
      },
    ];
    const { error: teErr } = await org.service.from("time_entries").insert(rows);
    if (teErr) throw teErr;
  });

  afterAll(async () => {
    await org.service.from("staff_identity_map").delete().eq("organization_id", org.orgId);
    await org.cleanup();
  });

  it("Dry-Run berichtet Fehlzuordnungen ohne zu schreiben", async () => {
    const res = await reassignImportedStaffCore({
      admin: org.service,
      organizationId: org.orgId,
      sourceSystem: "tagesabrechnung",
      mode: "dry_run",
    });
    expect(res.totalScanned).toBe(4);
    expect(res.totalMismatched).toBe(3);
    expect(res.totalUpdated).toBe(0);
    expect(res.groups.length).toBe(2); // (JAS-1→realA) und (LAM-1→realB)
    // DB unverändert: weiterhin 3 auf wrongStaffId.
    const { count } = await org.service
      .from("time_entries")
      .select("*", { head: true, count: "exact" })
      .eq("organization_id", org.orgId)
      .eq("staff_id", wrongStaffId);
    expect(count).toBe(3);
  });

  it("Commit hängt um, zweiter Lauf ist idempotent", async () => {
    const r1 = await reassignImportedStaffCore({
      admin: org.service,
      organizationId: org.orgId,
      sourceSystem: "tagesabrechnung",
      mode: "commit",
    });
    expect(r1.totalMismatched).toBe(3);
    expect(r1.totalUpdated).toBe(3);

    const { count: wrongAfter } = await org.service
      .from("time_entries")
      .select("*", { head: true, count: "exact" })
      .eq("organization_id", org.orgId)
      .eq("staff_id", wrongStaffId);
    expect(wrongAfter).toBe(0);

    const { count: aAfter } = await org.service
      .from("time_entries")
      .select("*", { head: true, count: "exact" })
      .eq("organization_id", org.orgId)
      .eq("staff_id", realA);
    expect(aAfter).toBe(3); // 2 umgehängt + 1 bereits korrekt

    const r2 = await reassignImportedStaffCore({
      admin: org.service,
      organizationId: org.orgId,
      sourceSystem: "tagesabrechnung",
      mode: "commit",
    });
    expect(r2.totalMismatched).toBe(0);
    expect(r2.totalUpdated).toBe(0);
  });
});
