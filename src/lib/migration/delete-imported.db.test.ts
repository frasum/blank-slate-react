// DB-Integrationstest für deleteImportedShiftsCore.
// Aktiv nur bei SUPABASE_DB_TESTS=1 (lokaler Supabase-Stack).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { dbTestsEnabled, seedOrg, type SeededOrg } from "@/test/db-setup";
import { deleteImportedShiftsCore } from "./delete-imported-shifts";

async function mkStaff(org: SeededOrg, name: string): Promise<string> {
  const { data, error } = await org.service
    .from("staff")
    .insert({
      organization_id: org.orgId,
      first_name: name,
      last_name: "X",
      display_name: name,
      is_active: true,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`staff insert: ${error?.message}`);
  return data.id;
}

describe.skipIf(!dbTestsEnabled)("deleteImportedShiftsCore — DB", () => {
  let org: SeededOrg;
  let admin: string;
  let alice: string;

  beforeAll(async () => {
    org = await seedOrg("delimp");
    admin = await mkStaff(org, "Admin-Proxy");
    alice = await mkStaff(org, "Alice");

    const base = new Date("2025-02-10T18:00:00.000Z").getTime();
    // 3 Import-Schichten auf Admin, 2 auf Alice, 1 clock-Schicht auf Alice
    // (darf NIE gelöscht werden), 1 manual auf Admin (ebenfalls geschützt).
    const rows: Array<{
      organization_id: string;
      staff_id: string;
      started_at: string;
      ended_at: string;
      business_date: string;
      source: "import" | "clock" | "manual";
      import_key: string | null;
      break_minutes: number;
    }> = [];
    for (let i = 0; i < 3; i++) {
      rows.push({
        organization_id: org.orgId,
        staff_id: admin,
        started_at: new Date(base + i * 86_400_000).toISOString(),
        ended_at: new Date(base + i * 86_400_000 + 3 * 3_600_000).toISOString(),
        business_date: new Date(base + i * 86_400_000).toISOString().slice(0, 10),
        source: "import",
        import_key: `tagesabrechnung:row-admin-${i}`,
        break_minutes: 0,
      });
    }
    for (let i = 0; i < 2; i++) {
      rows.push({
        organization_id: org.orgId,
        staff_id: alice,
        started_at: new Date(base + (10 + i) * 86_400_000).toISOString(),
        ended_at: new Date(base + (10 + i) * 86_400_000 + 4 * 3_600_000).toISOString(),
        business_date: new Date(base + (10 + i) * 86_400_000).toISOString().slice(0, 10),
        source: "import",
        import_key: `tagesabrechnung:row-alice-${i}`,
        break_minutes: 0,
      });
    }
    rows.push({
      organization_id: org.orgId,
      staff_id: alice,
      started_at: new Date(base + 20 * 86_400_000).toISOString(),
      ended_at: new Date(base + 20 * 86_400_000 + 5 * 3_600_000).toISOString(),
      business_date: new Date(base + 20 * 86_400_000).toISOString().slice(0, 10),
      source: "clock",
      import_key: null,
      break_minutes: 0,
    });
    rows.push({
      organization_id: org.orgId,
      staff_id: admin,
      started_at: new Date(base + 21 * 86_400_000).toISOString(),
      ended_at: new Date(base + 21 * 86_400_000 + 5 * 3_600_000).toISOString(),
      business_date: new Date(base + 21 * 86_400_000).toISOString().slice(0, 10),
      source: "manual",
      import_key: null,
      break_minutes: 0,
    });
    const { error } = await org.service.from("time_entries").insert(rows);
    if (error) throw error;
  });

  afterAll(async () => {
    await org.cleanup();
  });

  it("Dry-Run zählt nur, schreibt nichts; clock/manual bleiben unangetastet", async () => {
    const res = await deleteImportedShiftsCore({
      admin: org.service,
      organizationId: org.orgId,
      staffId: null,
      mode: "dry_run",
    });
    expect(res.totalMatched).toBe(5);
    expect(res.totalDeleted).toBe(0);
    expect(res.staffGroups.length).toBe(2);

    // Bestand unverändert.
    const { count } = await org.service
      .from("time_entries")
      .select("*", { head: true, count: "exact" })
      .eq("organization_id", org.orgId);
    expect(count).toBe(7);
  });

  it("Commit mit staff-Filter löscht nur Admin-Import, nicht Alice-Import und nicht clock/manual", async () => {
    const res = await deleteImportedShiftsCore({
      admin: org.service,
      organizationId: org.orgId,
      staffId: admin,
      mode: "commit",
    });
    expect(res.totalMatched).toBe(3);
    expect(res.totalDeleted).toBe(3);

    const { data: remaining } = await org.service
      .from("time_entries")
      .select("staff_id, source")
      .eq("organization_id", org.orgId);
    expect(remaining?.length).toBe(4);
    // Admin: nur noch manual übrig
    const adminLeft = remaining?.filter((r) => r.staff_id === admin) ?? [];
    expect(adminLeft.length).toBe(1);
    expect(adminLeft[0].source).toBe("manual");
    // Alice: 2 import + 1 clock
    const aliceLeft = remaining?.filter((r) => r.staff_id === alice) ?? [];
    expect(aliceLeft.length).toBe(3);
    expect(aliceLeft.filter((r) => r.source === "import").length).toBe(2);
    expect(aliceLeft.filter((r) => r.source === "clock").length).toBe(1);
  });

  it("Commit ohne Filter löscht restliche Import-Zeilen, idempotent", async () => {
    const r1 = await deleteImportedShiftsCore({
      admin: org.service,
      organizationId: org.orgId,
      staffId: null,
      mode: "commit",
    });
    expect(r1.totalMatched).toBe(2);
    expect(r1.totalDeleted).toBe(2);

    const r2 = await deleteImportedShiftsCore({
      admin: org.service,
      organizationId: org.orgId,
      staffId: null,
      mode: "commit",
    });
    expect(r2.totalMatched).toBe(0);
    expect(r2.totalDeleted).toBe(0);

    // Verbliebene Zeilen: 1 clock (Alice) + 1 manual (Admin).
    const { data: remaining } = await org.service
      .from("time_entries")
      .select("source")
      .eq("organization_id", org.orgId);
    expect(remaining?.length).toBe(2);
    const sources = (remaining ?? []).map((r) => r.source).sort();
    expect(sources).toEqual(["clock", "manual"]);
  });

  it("Sicherheitscheck: bricht ab, wenn eine Import-Zeile offen ist", async () => {
    // Eine offene Import-Zeile einfügen.
    await org.service.from("time_entries").insert({
      organization_id: org.orgId,
      staff_id: alice,
      started_at: new Date().toISOString(),
      ended_at: null,
      business_date: new Date().toISOString().slice(0, 10),
      source: "import",
      import_key: `tagesabrechnung:open-${crypto.randomUUID()}`,
      break_minutes: 0,
    });
    await expect(
      deleteImportedShiftsCore({
        admin: org.service,
        organizationId: org.orgId,
        staffId: null,
        mode: "commit",
      }),
    ).rejects.toThrow(/offen/i);
  });
});
