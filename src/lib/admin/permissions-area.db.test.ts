// DB-Integrationstest für das Berechtigungs-Fundament P-1.
//
// Geprüft: has_permission(perm, location, area) berücksichtigt die neue
// Bereichs-Dimension (kitchen/service/gl) korrekt; ALLOW/DENY/Default-Logik;
// 2-Arg-Aufrufer (ohne _area) sind weiterhin kompatibel.
//
// Läuft NUR in CI mit lokalem `supabase start` (SUPABASE_DB_TESTS=1).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { dbTestsEnabled, seedOrg, signInAsUser, type SeededOrg } from "@/test/db-setup";

type Effect = "allow" | "deny";

describe.skipIf(!dbTestsEnabled)("has_permission area-Logik (P-1)", () => {
  let org: SeededOrg;
  let planerStaffId: string;
  let locA: string;
  let locB: string;
  let planerEmail: string;
  let planerPassword: string;

  beforeAll(async () => {
    org = await seedOrg("perm-area");
    const planer = await org.mkUser("planer");
    planerStaffId = planer.staffId;
    planerEmail = planer.email;
    planerPassword = planer.password;
    locA = org.defaultLocationId;
    locB = await org.mkLocation("Standort B");
  });
  afterAll(async () => {
    await org.cleanup();
  });

  async function setOverride(
    permission: string,
    effect: Effect,
    locationId: string | null,
    area: "kitchen" | "service" | "gl" | null,
  ) {
    await org.service.from("permission_overrides").delete().eq("staff_id", planerStaffId);
    const { error } = await org.service.from("permission_overrides").insert({
      organization_id: org.orgId,
      staff_id: planerStaffId,
      permission: permission as never,
      effect: effect as never,
      location_id: locationId,
      area: area as never,
    });
    if (error) throw new Error(`override insert failed: ${error.message}`);
  }

  async function rpcHasPermission(
    permission: string,
    locationId: string | null,
    area: "kitchen" | "service" | "gl" | null,
  ): Promise<boolean> {
    const client = await signInAsUser(planerEmail, planerPassword);
    const { data, error } = await client.rpc("has_permission", {
      _perm: permission as never,
      _location: locationId ?? undefined,
      _area: (area ?? undefined) as never,
    });
    if (error) throw new Error(`rpc failed: ${error.message}`);
    return data === true;
  }

  it("ALLOW (L1+kitchen) trifft nur exakten Scope", async () => {
    await setOverride("roster.shift.manage", "allow", locA, "kitchen");
    expect(await rpcHasPermission("roster.shift.manage", locA, "kitchen")).toBe(true);
    expect(await rpcHasPermission("roster.shift.manage", locA, "service")).toBe(false);
    expect(await rpcHasPermission("roster.shift.manage", locB, "kitchen")).toBe(false);
    // _area weggelassen → bereichsgebundener Override matcht nicht
    expect(await rpcHasPermission("roster.shift.manage", locA, null)).toBe(false);
  });

  it("ALLOW (L1, area=NULL) gilt für alle Bereiche an L1", async () => {
    await setOverride("roster.shift.manage", "allow", locA, null);
    expect(await rpcHasPermission("roster.shift.manage", locA, "service")).toBe(true);
    expect(await rpcHasPermission("roster.shift.manage", locA, "kitchen")).toBe(true);
    expect(await rpcHasPermission("roster.shift.manage", locB, "service")).toBe(false);
  });

  it("DENY schlägt ALLOW im selben Scope", async () => {
    await org.service.from("permission_overrides").delete().eq("staff_id", planerStaffId);
    const { error: e1 } = await org.service.from("permission_overrides").insert({
      organization_id: org.orgId,
      staff_id: planerStaffId,
      permission: "roster.shift.manage" as never,
      effect: "allow" as never,
      location_id: locA,
      area: "kitchen" as never,
    });
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await org.service.from("permission_overrides").insert({
      organization_id: org.orgId,
      staff_id: planerStaffId,
      permission: "roster.shift.manage" as never,
      effect: "deny" as never,
      location_id: locA,
      area: "kitchen" as never,
    });
    if (e2) throw new Error(e2.message);
    expect(await rpcHasPermission("roster.shift.manage", locA, "kitchen")).toBe(false);
  });

  it("Lese-Default für planer greift global (ohne Scope)", async () => {
    await org.service.from("permission_overrides").delete().eq("staff_id", planerStaffId);
    expect(await rpcHasPermission("roster.shift.view_all", null, null)).toBe(true);
  });

  it("2-Arg-Aufruf bleibt kompatibel (kein _area)", async () => {
    await org.service.from("permission_overrides").delete().eq("staff_id", planerStaffId);
    const client = await signInAsUser(planerEmail, planerPassword);
    const { data, error } = await client.rpc("has_permission", {
      _perm: "roster.shift.view_all" as never,
      _location: undefined,
    });
    if (error) throw new Error(error.message);
    expect(data).toBe(true);
  });
});
