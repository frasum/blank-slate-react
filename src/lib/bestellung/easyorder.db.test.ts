// DB-Integrationstest für EasyOrder (Welle 4-B).
// Skips ohne SUPABASE_DB_TESTS.
//
// Geprüft (über die `...Core`-Helfer, die den Service-Client annehmen):
//   (a) staff OHNE access-row → getEasyOrderCatalog wirft.
//   (b) staff MIT access + leerer Lieferanten-Whitelist → Katalog enthält
//       alle aktiven Artikel der Org.
//   (c) staff MIT Whitelist [supplierA] → Katalog nur supplierA-Artikel.
//   (d) placeEasyOrder mit Artikel eines NICHT freigeschalteten Lieferanten
//       → wirft, KEINE Order angelegt (Count vorher/nachher gleich).
//   (e) placeEasyOrder Happy Path → Orders angelegt, pro Lieferant gruppiert,
//       Cart geleert.
//   (f) Freitext bei can_add_free_items=false → wirft.

import { describe, it, expect, beforeAll } from "vitest";
import { dbTestsEnabled, seedOrg, type SeededOrg, type SeededUser } from "@/test/db-setup";
import {
  getEasyOrderCatalogCore,
  placeEasyOrderCore,
} from "./easyorder.functions";
import type { AdminCaller } from "@/lib/admin/admin-context";

describe.skipIf(!dbTestsEnabled)("easyorder (DB)", () => {
  let org: SeededOrg;
  let staffUserA: SeededUser; // mit access an default-location
  let staffUserB: SeededUser; // ohne access
  let staffUserC: SeededUser; // mit access + whitelist auf supplierA
  let staffUserD: SeededUser; // mit access, can_add_free_items=false
  let supplierA: string;
  let supplierB: string;
  let artA1: string;
  let artA2: string;
  let artB1: string;

  const callerOf = (u: SeededUser): AdminCaller => ({
    userId: u.userId,
    staffId: u.staffId,
    organizationId: org.orgId,
    role: "staff",
  });

  beforeAll(async () => {
    org = await seedOrg("easyorder");
    staffUserA = await org.mkUser("staff");
    staffUserB = await org.mkUser("staff");
    staffUserC = await org.mkUser("staff");
    staffUserD = await org.mkUser("staff");

    const { data: sA } = await org.service
      .from("suppliers")
      .insert({ organization_id: org.orgId, name: "Lieferant A", email: "a@example.com" })
      .select("id")
      .single();
    const { data: sB } = await org.service
      .from("suppliers")
      .insert({ organization_id: org.orgId, name: "Lieferant B", email: "b@example.com" })
      .select("id")
      .single();
    supplierA = sA!.id;
    supplierB = sB!.id;

    const mkArt = async (sup: string, name: string, cents: number) => {
      const { data } = await org.service
        .from("articles")
        .insert({
          organization_id: org.orgId,
          supplier_id: sup,
          name,
          price_cents: cents,
          unit: "Stk",
        })
        .select("id")
        .single();
      return data!.id as string;
    };
    artA1 = await mkArt(supplierA, "Tomaten", 250);
    artA2 = await mkArt(supplierA, "Basilikum", 180);
    artB1 = await mkArt(supplierB, "Olivenöl", 1200);

    // Access-Rows: A (alles), C (whitelist A), D (no free-text). B bewusst NICHT.
    await org.service.from("staff_easyorder_access").insert([
      {
        organization_id: org.orgId,
        staff_id: staffUserA.staffId,
        location_id: org.defaultLocationId,
        can_add_free_items: true,
        is_active: true,
      },
      {
        organization_id: org.orgId,
        staff_id: staffUserC.staffId,
        location_id: org.defaultLocationId,
        can_add_free_items: true,
        is_active: true,
      },
      {
        organization_id: org.orgId,
        staff_id: staffUserD.staffId,
        location_id: org.defaultLocationId,
        can_add_free_items: false,
        is_active: true,
      },
    ]);
    await org.service.from("staff_easyorder_suppliers").insert({
      organization_id: org.orgId,
      staff_id: staffUserC.staffId,
      location_id: org.defaultLocationId,
      supplier_id: supplierA,
    });
  });

  it("(a) staff ohne access → Katalog wirft", async () => {
    await expect(
      getEasyOrderCatalogCore(org.service, callerOf(staffUserB), org.defaultLocationId),
    ).rejects.toThrow(/EasyOrder-Berechtigung/);
  });

  it("(b) access + leere Whitelist → alle aktiven Artikel", async () => {
    const cat = await getEasyOrderCatalogCore(
      org.service,
      callerOf(staffUserA),
      org.defaultLocationId,
    );
    const ids = cat.articles.map((a) => a.id).sort();
    expect(ids).toEqual([artA1, artA2, artB1].sort());
  });

  it("(c) Whitelist [supplierA] → nur supplierA-Artikel", async () => {
    const cat = await getEasyOrderCatalogCore(
      org.service,
      callerOf(staffUserC),
      org.defaultLocationId,
    );
    const ids = cat.articles.map((a) => a.id).sort();
    expect(ids).toEqual([artA1, artA2].sort());
    expect(cat.articles.every((a) => a.supplierId === supplierA)).toBe(true);
  });

  async function countOrders(): Promise<number> {
    const { data } = await org.service
      .from("orders")
      .select("id")
      .eq("organization_id", org.orgId);
    return data?.length ?? 0;
  }

  it("(d) Artikel von gesperrtem Lieferanten → wirft, KEINE Order", async () => {
    const before = await countOrders();
    await expect(
      placeEasyOrderCore(org.service, callerOf(staffUserC), {
        locationId: org.defaultLocationId,
        items: [{ articleId: artB1, quantity: 1 }],
      }),
    ).rejects.toThrow(/nicht freigeschaltetem Lieferanten/);
    expect(await countOrders()).toBe(before);
  });

  it("(e) Happy Path → Orders pro Lieferant, Cart geleert", async () => {
    const result = await placeEasyOrderCore(org.service, callerOf(staffUserA), {
      locationId: org.defaultLocationId,
      items: [
        { articleId: artA1, quantity: 3 },
        { articleId: artA2, quantity: 2 },
        { articleId: artB1, quantity: 1 },
      ],
      notes: "EasyOrder-Test",
    });
    expect(result.orderIds.length).toBe(2);

    const { data: orders } = await org.service
      .from("orders")
      .select("id, supplier_id, total_amount_cents, notes")
      .in("id", result.orderIds);
    const a = orders!.find((o) => o.supplier_id === supplierA)!;
    const b = orders!.find((o) => o.supplier_id === supplierB)!;
    expect(Number(a.total_amount_cents)).toBe(1110);
    expect(Number(b.total_amount_cents)).toBe(1200);
    expect(a.notes).toBe("EasyOrder-Test");

    // Cart leer
    const { data: carts } = await org.service
      .from("carts")
      .select("id")
      .eq("organization_id", org.orgId)
      .eq("user_id", staffUserA.userId);
    if (carts && carts.length > 0) {
      const { data: leftover } = await org.service
        .from("cart_items")
        .select("id")
        .eq("cart_id", carts[0].id);
      expect(leftover!.length).toBe(0);
    }
  });

  it("(f) Freitext bei can_add_free_items=false → wirft", async () => {
    await expect(
      placeEasyOrderCore(org.service, callerOf(staffUserD), {
        locationId: org.defaultLocationId,
        items: [{ articleId: artA1, quantity: 1 }],
        freeTextItems: [
          { supplierId: supplierA, name: "Sondergewürz", quantity: 2 },
        ],
      }),
    ).rejects.toThrow(/Freitext/);
  });
});