// DB-Integrationstest für EasyOrder-Verwaltung (Welle 4-D).
// Skips ohne SUPABASE_DB_TESTS.

import { describe, it, expect, beforeAll } from "vitest";
import { dbTestsEnabled, seedOrg, type SeededOrg, type SeededUser } from "@/test/db-setup";
import {
  grantEasyOrderAccessCore,
  listEasyOrderAccessCore,
  revokeEasyOrderAccessCore,
  setEasyOrderSupplierWhitelistCore,
} from "./easyorder-admin.functions";

describe.skipIf(!dbTestsEnabled)("easyorder-admin (DB)", () => {
  let orgA: SeededOrg;
  let orgB: SeededOrg;
  let staffA: SeededUser;
  let staffB: SeededUser; // gehört zu orgB
  let supplierA1: string;
  let supplierA2: string;
  let supplierBForeign: string;
  let locationBForeign: string;

  beforeAll(async () => {
    orgA = await seedOrg("easyorder-admin-a");
    orgB = await seedOrg("easyorder-admin-b");
    staffA = await orgA.mkUser("staff");
    staffB = await orgB.mkUser("staff");

    const mkSupplier = async (org: SeededOrg, name: string) => {
      const { data } = await org.service
        .from("suppliers")
        .insert({ organization_id: org.orgId, name, email: `${name}@x.com` })
        .select("id")
        .single();
      return data!.id as string;
    };
    supplierA1 = await mkSupplier(orgA, "LiefA1");
    supplierA2 = await mkSupplier(orgA, "LiefA2");
    supplierBForeign = await mkSupplier(orgB, "LiefB");
    locationBForeign = orgB.defaultLocationId;
  });

  it("(a) grant erstellt Row; list zeigt sie", async () => {
    await grantEasyOrderAccessCore(orgA.service, orgA.orgId, {
      staffId: staffA.staffId,
      locationId: orgA.defaultLocationId,
      canAddFreeItems: true,
      isActive: true,
    });
    const list = await listEasyOrderAccessCore(orgA.service, orgA.orgId);
    const row = list.find((r) => r.staffId === staffA.staffId);
    expect(row).toBeDefined();
    expect(row!.entries).toHaveLength(1);
    expect(row!.entries[0].locationId).toBe(orgA.defaultLocationId);
    expect(row!.entries[0].canAddFreeItems).toBe(true);
    expect(row!.entries[0].supplierIds).toEqual([]);
  });

  it("(b) grant mit staffId aus anderer Org → wirft, keine Row", async () => {
    await expect(
      grantEasyOrderAccessCore(orgA.service, orgA.orgId, {
        staffId: staffB.staffId, // gehört zu orgB
        locationId: orgA.defaultLocationId,
        canAddFreeItems: false,
        isActive: true,
      }),
    ).rejects.toThrow(/Mitarbeiter nicht/);
    const { data } = await orgA.service
      .from("staff_easyorder_access")
      .select("id")
      .eq("organization_id", orgA.orgId)
      .eq("staff_id", staffB.staffId);
    expect(data ?? []).toHaveLength(0);

    // Auch foreign location:
    await expect(
      grantEasyOrderAccessCore(orgA.service, orgA.orgId, {
        staffId: staffA.staffId,
        locationId: locationBForeign,
        canAddFreeItems: false,
        isActive: true,
      }),
    ).rejects.toThrow(/Standort nicht/);
  });

  it("(c) setWhitelist mit fremdem supplier → wirft", async () => {
    await expect(
      setEasyOrderSupplierWhitelistCore(orgA.service, orgA.orgId, {
        staffId: staffA.staffId,
        locationId: orgA.defaultLocationId,
        supplierIds: [supplierA1, supplierBForeign],
      }),
    ).rejects.toThrow(/Lieferant nicht/);
  });

  it("(d) setWhitelist ohne access-Row → wirft", async () => {
    const otherLoc = await orgA.mkLocation("Filiale 2");
    await expect(
      setEasyOrderSupplierWhitelistCore(orgA.service, orgA.orgId, {
        staffId: staffA.staffId,
        locationId: otherLoc,
        supplierIds: [supplierA1],
      }),
    ).rejects.toThrow(/Zugriff existiert/);
  });

  it("(e) revoke entfernt access + whitelist für diese Location", async () => {
    // Whitelist setzen
    await setEasyOrderSupplierWhitelistCore(orgA.service, orgA.orgId, {
      staffId: staffA.staffId,
      locationId: orgA.defaultLocationId,
      supplierIds: [supplierA1, supplierA2],
    });
    const { data: wlBefore } = await orgA.service
      .from("staff_easyorder_suppliers")
      .select("id")
      .eq("staff_id", staffA.staffId)
      .eq("location_id", orgA.defaultLocationId);
    expect(wlBefore ?? []).toHaveLength(2);

    await revokeEasyOrderAccessCore(orgA.service, orgA.orgId, {
      staffId: staffA.staffId,
      locationId: orgA.defaultLocationId,
    });

    const { data: accAfter } = await orgA.service
      .from("staff_easyorder_access")
      .select("id")
      .eq("staff_id", staffA.staffId)
      .eq("location_id", orgA.defaultLocationId);
    expect(accAfter ?? []).toHaveLength(0);
    const { data: wlAfter } = await orgA.service
      .from("staff_easyorder_suppliers")
      .select("id")
      .eq("staff_id", staffA.staffId)
      .eq("location_id", orgA.defaultLocationId);
    expect(wlAfter ?? []).toHaveLength(0);
  });

  it("(f) leere supplierIds → whitelist-Rows entfernt", async () => {
    // Neu granten
    await grantEasyOrderAccessCore(orgA.service, orgA.orgId, {
      staffId: staffA.staffId,
      locationId: orgA.defaultLocationId,
      canAddFreeItems: false,
      isActive: true,
    });
    await setEasyOrderSupplierWhitelistCore(orgA.service, orgA.orgId, {
      staffId: staffA.staffId,
      locationId: orgA.defaultLocationId,
      supplierIds: [supplierA1],
    });
    const res = await setEasyOrderSupplierWhitelistCore(orgA.service, orgA.orgId, {
      staffId: staffA.staffId,
      locationId: orgA.defaultLocationId,
      supplierIds: [],
    });
    expect(res.count).toBe(0);
    const { data } = await orgA.service
      .from("staff_easyorder_suppliers")
      .select("id")
      .eq("staff_id", staffA.staffId)
      .eq("location_id", orgA.defaultLocationId);
    expect(data ?? []).toHaveLength(0);
  });
});
