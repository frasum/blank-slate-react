// DB-Integrationstest für `importStaffPersonalDetails` (Welle 2).
// Aktiv nur bei SUPABASE_DB_TESTS=1.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { dbTestsEnabled, seedOrg, signInAsUser, type SeededOrg } from "@/test/db-setup";
import { runImportDetailsCore } from "./import-details-core";
import type { DetailsRowInput } from "./import-details";

function row(over: Partial<DetailsRowInput> & { personnelNumber: string }): DetailsRowInput {
  const base: DetailsRowInput = {
    personnelNumber: over.personnelNumber,
    firstName: "X",
    lastName: "Y",
    salutation: null,
    phone: null,
    email: null,
    address: null,
    dateOfBirth: null,
    placeOfBirth: null,
    nationality: null,
    taxClass: null,
    taxId: null,
    socialSecurityNumber: null,
    isMinijob: null,
    isSvExempt: null,
    healthInsurance: null,
    churchTaxLiable: null,
    childTaxAllowances: null,
    iban: null,
    bankName: null,
    accountHolder: null,
    employmentStartDate: null,
    employmentEndDate: null,
    personnelGroup: null,
    jobTitle: null,
    vacationDaysContractual: null,
    vacationDaysPreviousYear: null,
    vacationDaysCurrentYear: null,
    vacationDaysTaken: null,
  };
  return { ...base, ...over };
}

async function mkStaffWithPersoNr(
  org: SeededOrg,
  firstName: string,
  persoNr: number | null,
): Promise<string> {
  const { data, error } = await org.service
    .from("staff")
    .insert({
      organization_id: org.orgId,
      first_name: firstName,
      last_name: "Test",
      display_name: firstName,
      is_active: true,
      perso_nr: persoNr,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`staff insert: ${error?.message}`);
  return data.id;
}

describe.skipIf(!dbTestsEnabled)("importStaffPersonalDetails — DB (Welle 2)", () => {
  let org: SeededOrg;

  beforeAll(async () => {
    org = await seedOrg("importD");
  });

  afterAll(async () => {
    await org.service.from("staff_personal_details").delete().eq("organization_id", org.orgId);
    await org.cleanup();
  });

  it("(a) PN-Brücke '000006' → perso_nr=6 → staff_id; (c) UPSERT insert", async () => {
    const s = await mkStaffWithPersoNr(org, "Andi", 6);
    const r = await runImportDetailsCore({
      admin: org.service,
      organizationId: org.orgId,
      rows: [
        row({
          personnelNumber: "000006",
          firstName: "Andi",
          lastName: "S",
          phone: "030 1",
          iban: "DE89370400440532013000",
        }),
      ],
      mode: "commit",
    });
    expect(r.plan.totals.inserts).toBe(1);
    const { data } = await org.service
      .from("staff_personal_details")
      .select("phone, iban")
      .eq("staff_id", s)
      .single();
    expect(data?.phone).toBe("030 1");
    expect(data?.iban).toBe("DE89370400440532013000");
  });

  it("(b) Dummy 123456 → skipped unknown_personnel_number, kein Insert", async () => {
    const before = await org.service
      .from("staff_personal_details")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.orgId);
    const r = await runImportDetailsCore({
      admin: org.service,
      organizationId: org.orgId,
      rows: [row({ personnelNumber: "123456", firstName: "Net", lastName: "Net" })],
      mode: "commit",
    });
    expect(r.plan.totals.skippedCount).toBe(1);
    expect(r.plan.skippedRows[0].reason).toBe("unknown_personnel_number");
    const after = await org.service
      .from("staff_personal_details")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.orgId);
    expect(after.count).toBe(before.count);
  });

  it("(d) UPSERT update + (e) leere Werte nicht überschrieben", async () => {
    const s = await mkStaffWithPersoNr(org, "Tina", 7);
    // Erst-Insert
    await runImportDetailsCore({
      admin: org.service,
      organizationId: org.orgId,
      rows: [row({ personnelNumber: "7", phone: "030 alt", iban: "DE_BESTAND" })],
      mode: "commit",
    });
    // Update: phone neu, iban leer im CSV → bleibt
    const r = await runImportDetailsCore({
      admin: org.service,
      organizationId: org.orgId,
      rows: [row({ personnelNumber: "7", phone: "030 neu", iban: null })],
      mode: "commit",
    });
    expect(r.plan.totals.updates).toBe(1);
    const { data } = await org.service
      .from("staff_personal_details")
      .select("phone, iban")
      .eq("staff_id", s)
      .single();
    expect(data?.phone).toBe("030 neu");
    expect(data?.iban).toBe("DE_BESTAND");
  });

  it("(g) RLS-Wall: Staff-Rolle sieht 0 Zeilen, Client kann nicht INSERTen", async () => {
    const s = await mkStaffWithPersoNr(org, "Walli", 99);
    await org.service.from("staff_personal_details").insert({
      organization_id: org.orgId,
      staff_id: s,
      phone: "Geheim",
    });

    const staffUser = await org.mkUser("staff");
    const sClient = await signInAsUser(staffUser.email, staffUser.password);
    const { data: rows, error: selErr } = await sClient
      .from("staff_personal_details")
      .select("id");
    expect(selErr).toBeNull();
    expect(rows ?? []).toEqual([]);

    const { error: insErr } = await sClient.from("staff_personal_details").insert({
      organization_id: org.orgId,
      staff_id: s,
      phone: "x",
    });
    expect(insErr).not.toBeNull();
  });

  it("Manager kann lesen (SELECT-Policy greift)", async () => {
    const mgrUser = await org.mkUser("manager");
    const mClient = await signInAsUser(mgrUser.email, mgrUser.password);
    const { data, error } = await mClient.from("staff_personal_details").select("id");
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });
});
