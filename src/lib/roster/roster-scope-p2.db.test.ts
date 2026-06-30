// DB-Integrationstest P-2: scoped Berechtigung im Schreibpfad.
//
// Geprüft wird die Brücke `assertPermission(perm, location, area)` (so wie
// die fünf Dienstplan-Schreib-Functions sie aufrufen), gegen einen Planer
// mit ALLOW-Override (L1, kitchen) und gegen einen Manager (globaler
// manage-Default — Regression: scoped Check darf ihn nicht blocken).
//
// Läuft NUR in CI mit lokalem `supabase start` (SUPABASE_DB_TESTS=1).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { dbTestsEnabled, seedOrg, signInAsUser, type SeededOrg } from "@/test/db-setup";
import { assertPermission } from "@/lib/admin/admin-call";
import { ForbiddenError } from "@/lib/admin/role-guard";

describe.skipIf(!dbTestsEnabled)("roster scoped permission (P-2)", () => {
  let org: SeededOrg;
  let locA: string;
  let locB: string;
  let planerEmail: string;
  let planerPassword: string;
  let managerEmail: string;
  let managerPassword: string;

  beforeAll(async () => {
    org = await seedOrg("roster-scope-p2");
    locA = org.defaultLocationId;
    locB = await org.mkLocation("Standort B");

    const planer = await org.mkUser("planer");
    planerEmail = planer.email;
    planerPassword = planer.password;

    const manager = await org.mkUser("manager");
    managerEmail = manager.email;
    managerPassword = manager.password;

    // ALLOW-Override für (L1, kitchen) auf roster.shift.manage.
    const { error } = await org.service.from("permission_overrides").insert({
      organization_id: org.orgId,
      staff_id: planer.staffId,
      permission: "roster.shift.manage" as never,
      effect: "allow" as never,
      location_id: locA,
      area: "kitchen" as never,
    });
    if (error) throw new Error(error.message);
  });

  afterAll(async () => {
    await org.cleanup();
  });

  it("Planer: createRosterShift-Scope (L1, kitchen) → ok", async () => {
    const client = await signInAsUser(planerEmail, planerPassword);
    await expect(
      assertPermission(client, "roster.shift.manage", locA, "kitchen"),
    ).resolves.toBeUndefined();
  });

  it("Planer: createRosterShift-Scope (L1, service) → ForbiddenError", async () => {
    const client = await signInAsUser(planerEmail, planerPassword);
    await expect(
      assertPermission(client, "roster.shift.manage", locA, "service"),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("Planer: createRosterShift-Scope (L2, kitchen) → ForbiddenError", async () => {
    const client = await signInAsUser(planerEmail, planerPassword);
    await expect(
      assertPermission(client, "roster.shift.manage", locB, "kitchen"),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("Planer: scope ohne area → ForbiddenError (kein globaler manage-Default)", async () => {
    const client = await signInAsUser(planerEmail, planerPassword);
    await expect(assertPermission(client, "roster.shift.manage", locA)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("Planer: move kitchen→service → Ziel-Scope abgelehnt", async () => {
    // Quelle (L1,kitchen) ok, Ziel (L1,service) nicht erlaubt.
    const client = await signInAsUser(planerEmail, planerPassword);
    await expect(
      assertPermission(client, "roster.shift.manage", locA, "kitchen"),
    ).resolves.toBeUndefined();
    await expect(
      assertPermission(client, "roster.shift.manage", locA, "service"),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("Manager-Regression: globaler manage-Default greift in jedem Scope", async () => {
    const client = await signInAsUser(managerEmail, managerPassword);
    await expect(
      assertPermission(client, "roster.shift.manage", locA, "kitchen"),
    ).resolves.toBeUndefined();
    await expect(
      assertPermission(client, "roster.shift.manage", locA, "service"),
    ).resolves.toBeUndefined();
    await expect(
      assertPermission(client, "roster.shift.manage", locB, "gl"),
    ).resolves.toBeUndefined();
    await expect(
      assertPermission(client, "roster.shift.manage", null, null),
    ).resolves.toBeUndefined();
  });
});
