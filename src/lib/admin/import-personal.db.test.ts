// DB-Integrationstest für `importStaffPersonalData` (Welle 1).
// Aktiv nur bei SUPABASE_DB_TESTS=1. Ruft das Core-Modul direkt mit dem
// service_role-Client auf. Role-guard wird über die DENY-ALL-Realität
// (Manager kann staff_compensation nicht direkt schreiben) verifiziert,
// das Server-Fn-Guard-Verhalten ist über runGuarded/loadAdminCaller-Tests
// gedeckt.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { dbTestsEnabled, seedOrg, signInAsUser, type SeededOrg } from "@/test/db-setup";
import { runImportPersonalCore } from "./import-personal-core";
import type { PersonalRowInput } from "./import-personal";

const FALLBACK = "2026-06-14";

async function mkStaff(
  org: SeededOrg,
  firstName: string,
  lastName: string,
  displayName: string,
): Promise<string> {
  const { data, error } = await org.service
    .from("staff")
    .insert({
      organization_id: org.orgId,
      first_name: firstName,
      last_name: lastName,
      display_name: displayName,
      is_active: true,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`staff insert: ${error?.message}`);
  return data.id;
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

describe.skipIf(!dbTestsEnabled)("importStaffPersonalData — DB (Welle 1)", () => {
  let org: SeededOrg;

  beforeAll(async () => {
    org = await seedOrg("importP");
  });

  afterAll(async () => {
    await org.service.from("staff_compensation").delete().eq("organization_id", org.orgId);
    await org.service.from("staff_identity_map").delete().eq("organization_id", org.orgId);
    await org.cleanup();
  });

  it("(f) Namen-Update inkl. Klammer-Spitzname landet 1:1 in staff", async () => {
    const s = await mkStaff(org, "Andi", "Sukphasathit", "ANDI");
    await addMapping(org, "alt-andi", "ANDI", s);

    const rows: PersonalRowInput[] = [
      {
        altStaffId: "alt-andi",
        firstName: "Phattanaphol (ANDI)",
        lastName: "Sukphasathit",
        nickname: "ANDI",
        persoNr: 42,
        hourlyRate: 16.5,
        employmentStart: "2024-01-15",
      },
    ];
    const r = await runImportPersonalCore({
      admin: org.service,
      organizationId: org.orgId,
      sourceSystem: "tagesabrechnung",
      rows,
      mode: "commit",
      fallbackValidFrom: FALLBACK,
    });
    expect(r.plan.totals.nameUpdates).toBe(1);

    const { data } = await org.service
      .from("staff")
      .select("first_name, last_name, perso_nr")
      .eq("id", s)
      .single();
    expect(data?.first_name).toBe("Phattanaphol (ANDI)");
    expect((data as { perso_nr: number | null } | null)?.perso_nr).toBe(42);
  });

  it("(g) staff_compensation: erst INSERT, dann UPDATE (Unique staff_id greift)", async () => {
    const s = await mkStaff(org, "Tina", "T", "TINA");
    await addMapping(org, "alt-tina", "TINA", s);

    const base: PersonalRowInput = {
      altStaffId: "alt-tina",
      firstName: "Tina",
      lastName: "T",
      nickname: "TINA",
      persoNr: 1,
      hourlyRate: 15,
      employmentStart: "2023-04-01",
    };
    const first = await runImportPersonalCore({
      admin: org.service,
      organizationId: org.orgId,
      sourceSystem: "tagesabrechnung",
      rows: [base],
      mode: "commit",
      fallbackValidFrom: FALLBACK,
    });
    expect(first.plan.totals.compInserts).toBe(1);

    const second = await runImportPersonalCore({
      admin: org.service,
      organizationId: org.orgId,
      sourceSystem: "tagesabrechnung",
      rows: [{ ...base, hourlyRate: 17.25 }],
      mode: "commit",
      fallbackValidFrom: FALLBACK,
    });
    expect(second.plan.totals.compInserts).toBe(0);
    expect(second.plan.totals.compUpdates).toBe(1);

    const { data } = await org.service
      .from("staff_compensation")
      .select("hourly_rate, valid_from")
      .eq("staff_id", s)
      .single();
    expect(Number(data?.hourly_rate)).toBe(17.25);
    expect(data?.valid_from).toBe("2023-04-01");
  });

  it("(h) Fallback bei leerem employment_start: valid_from=fallback, fallback-Flag", async () => {
    const s = await mkStaff(org, "Andre", "X", "ANDRE");
    await addMapping(org, "alt-andre", "ANDRE", s);

    const r = await runImportPersonalCore({
      admin: org.service,
      organizationId: org.orgId,
      sourceSystem: "tagesabrechnung",
      rows: [
        {
          altStaffId: "alt-andre",
          firstName: "Andre",
          lastName: "X",
          nickname: "ANDRE",
          persoNr: null,
          hourlyRate: 14,
          employmentStart: null,
        },
      ],
      mode: "commit",
      fallbackValidFrom: FALLBACK,
    });
    expect(r.plan.totals.compFallbacks).toBe(1);
    const { data } = await org.service
      .from("staff_compensation")
      .select("valid_from")
      .eq("staff_id", s)
      .single();
    expect(data?.valid_from).toBe(FALLBACK);
  });

  it("(i) Geist (kein identity_map-Treffer) → skipped, staff/comp unverändert", async () => {
    const before = await org.service
      .from("staff")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.orgId);
    const compBefore = await org.service
      .from("staff_compensation")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.orgId);

    const r = await runImportPersonalCore({
      admin: org.service,
      organizationId: org.orgId,
      sourceSystem: "tagesabrechnung",
      rows: [
        {
          altStaffId: "6756a58e-ghost-ghost-ghost-ghostghostgh",
          firstName: "Ghost",
          lastName: "Ghost",
          nickname: "",
          persoNr: null,
          hourlyRate: 0,
          employmentStart: null,
        },
      ],
      mode: "commit",
      fallbackValidFrom: FALLBACK,
    });
    expect(r.plan.totals.skippedCount).toBe(1);
    expect(r.plan.skippedRows[0].reason).toBe("unknown_alt_staff");

    const after = await org.service
      .from("staff")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.orgId);
    const compAfter = await org.service
      .from("staff_compensation")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.orgId);
    expect(after.count).toBe(before.count);
    expect(compAfter.count).toBe(compBefore.count);
  });

  it("(j) Role-guard: Staff kann staff_compensation NICHT direkt schreiben (RLS-Wall)", async () => {
    const s = await org.mkUser("staff");
    const client = await signInAsUser(s.email, s.password);
    const { error } = await client.from("staff_compensation").insert({
      organization_id: org.orgId,
      staff_id: s.staffId,
      hourly_rate: 99,
      valid_from: "2026-01-01",
    });
    expect(error).not.toBeNull();
  });
});