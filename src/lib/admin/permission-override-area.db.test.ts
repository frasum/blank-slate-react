// DB-Integrationstest für P-3a: area-Dimension im Upsert von
// permission_overrides. Validiert, dass das delete+insert-Muster aus
// setPermissionOverride die area-Spalte berücksichtigt — Overrides für
// (Standort, Küche) und (Standort, Service) dürfen koexistieren, und ein
// erneuter Set auf (Standort, Küche) darf NICHT den Service-Eintrag löschen.
//
// Läuft NUR in CI mit lokalem `supabase start` (SUPABASE_DB_TESTS=1).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { dbTestsEnabled, seedOrg, type SeededOrg } from "@/test/db-setup";

type Area = "kitchen" | "service" | "gl" | null;

describe.skipIf(!dbTestsEnabled)("permission_overrides area-Upsert (P-3a)", () => {
  let org: SeededOrg;
  let planerStaffId: string;
  let locA: string;
  const PERM = "roster.shift.manage";

  beforeAll(async () => {
    org = await seedOrg("perm-area-upsert");
    const planer = await org.mkUser("planer");
    planerStaffId = planer.staffId;
    locA = org.defaultLocationId;
  });
  afterAll(async () => {
    await org.cleanup();
  });

  // Spiegelt den delete+insert-Pfad aus setPermissionOverride. Der Test
  // verifiziert das genaue SQL-Muster — bewusst keine Indirektion über die
  // Server-Function, weil die Bearer-Auth in DB-Tests fehlt.
  async function upsert(
    permission: string,
    effect: "allow" | "deny",
    locationId: string | null,
    area: Area,
  ) {
    const delQ = org.service
      .from("permission_overrides")
      .delete()
      .eq("staff_id", planerStaffId)
      .eq("permission", permission as never);
    const delLoc = locationId ? delQ.eq("location_id", locationId) : delQ.is("location_id", null);
    const del = await (area ? delLoc.eq("area", area as never) : delLoc.is("area", null));
    if (del.error) throw new Error(`delete failed: ${del.error.message}`);

    const { error: insErr } = await org.service.from("permission_overrides").insert({
      organization_id: org.orgId,
      staff_id: planerStaffId,
      permission: permission as never,
      effect: effect as never,
      location_id: locationId,
      area: area as never,
    });
    if (insErr) throw new Error(`insert failed: ${insErr.message}`);
  }

  async function load(): Promise<
    Array<{ permission: string; effect: string; location_id: string | null; area: Area }>
  > {
    const { data, error } = await org.service
      .from("permission_overrides")
      .select("permission, effect, location_id, area")
      .eq("staff_id", planerStaffId);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      permission: string;
      effect: string;
      location_id: string | null;
      area: Area;
    }>;
  }

  it("Overrides für (L, kitchen) und (L, service) koexistieren; gezielter Re-Upsert trifft nur die kitchen-Zeile", async () => {
    await org.service.from("permission_overrides").delete().eq("staff_id", planerStaffId);

    // 1) (L, kitchen, allow)
    await upsert(PERM, "allow", locA, "kitchen");
    let rows = await load();
    expect(rows).toHaveLength(1);

    // 2) (L, service, allow) — darf den kitchen-Eintrag NICHT entfernen
    await upsert(PERM, "allow", locA, "service");
    rows = await load();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.area === "kitchen")?.effect).toBe("allow");
    expect(rows.find((r) => r.area === "service")?.effect).toBe("allow");

    // 3) Re-Upsert (L, kitchen, deny) — trifft nur die kitchen-Zeile
    await upsert(PERM, "deny", locA, "kitchen");
    rows = await load();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.area === "kitchen")?.effect).toBe("deny");
    expect(rows.find((r) => r.area === "service")?.effect).toBe("allow");
  });
});
