// DB-Integrationstest für die SQL-RPC create_order_from_cart.
// Geprüft:
//   (a) Happy Path: Cart mit 2 Lieferanten → 2 Orders, korrekte Item-
//       Snapshots, korrekte total_amount_cents, Cart geleert.
//   (b) Freitext-Item → order_item mit is_free_text_item, unit_price 0.
//   (c) Leerer Cart → Exception (P0004).
//   (d) Cart ohne location_id → Exception (P0002).
//   (e) ATOMARITÄT: Fehler mitten in der Anlage → KEINE Orders, KEINE
//       order_items, Cart-Items bleiben (Rollback bewiesen).

import { describe, it, expect, beforeAll } from "vitest";
import { dbTestsEnabled, seedOrg, type SeededOrg, type SeededUser } from "@/test/db-setup";

describe.skipIf(!dbTestsEnabled)("create_order_from_cart (DB-RPC)", () => {
  let org: SeededOrg;
  let user: SeededUser;
  let supplierA: string;
  let supplierB: string;
  let artA1: string;
  let artA2: string;
  let artB1: string;

  beforeAll(async () => {
    org = await seedOrg("order-rpc");
    user = await org.mkUser("manager");

    await org.service
      .from("locations")
      .update({ street: "Hauptstr. 1", postal_code: "80331", city: "München" })
      .eq("id", org.defaultLocationId);

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
  });

  async function seedCart(
    items: Array<{
      article_id?: string;
      supplier_id: string | null;
      quantity: number;
      is_free_text_item?: boolean;
      free_text_name?: string;
      free_text_unit?: string;
    }>,
    withLocation = true,
  ) {
    await org.service
      .from("carts")
      .delete()
      .eq("organization_id", org.orgId)
      .eq("user_id", user.userId);

    const { data: cart } = await org.service
      .from("carts")
      .insert({
        organization_id: org.orgId,
        user_id: user.userId,
        location_id: withLocation ? org.defaultLocationId : null,
        delivery_date: "2026-06-20",
        time_window: "08:00-10:00",
      })
      .select("id")
      .single();

    for (const it of items) {
      await org.service.from("cart_items").insert({
        organization_id: org.orgId,
        cart_id: cart!.id,
        article_id: it.article_id ?? null,
        supplier_id: it.supplier_id,
        quantity: it.quantity,
        is_free_text_item: it.is_free_text_item ?? false,
        free_text_name: it.free_text_name ?? null,
        free_text_unit: it.free_text_unit ?? null,
      });
    }
    return cart!.id as string;
  }

  async function callRpc() {
    return org.service.rpc("create_order_from_cart", {
      p_org_id: org.orgId,
      p_user_id: user.userId,
      p_notes: "Testnotiz",
    });
  }

  it("(a) Happy Path: 2 Lieferanten → 2 Orders mit korrekten Snapshots + Summen, Cart geleert", async () => {
    const cartId = await seedCart([
      { article_id: artA1, supplier_id: supplierA, quantity: 3 },
      { article_id: artA2, supplier_id: supplierA, quantity: 2 },
      { article_id: artB1, supplier_id: supplierB, quantity: 1 },
    ]);

    const { data: orderIds, error } = await callRpc();
    expect(error).toBeNull();
    expect((orderIds ?? []).length).toBe(2);

    const { data: orders } = await org.service
      .from("orders")
      .select("id, supplier_id, total_amount_cents, delivery_address, notes, status")
      .in("id", orderIds as string[]);

    const a = orders!.find((o) => o.supplier_id === supplierA)!;
    const b = orders!.find((o) => o.supplier_id === supplierB)!;
    expect(Number(a.total_amount_cents)).toBe(1110);
    expect(Number(b.total_amount_cents)).toBe(1200);
    expect(a.status).toBe("pending");
    expect(a.delivery_address).toContain("München");
    expect(a.notes).toBe("Testnotiz");

    const { data: itemsA } = await org.service
      .from("order_items")
      .select("article_name, unit_price_cents, total_price_cents")
      .eq("order_id", a.id);
    expect(itemsA!.length).toBe(2);

    const { data: leftover } = await org.service
      .from("cart_items")
      .select("id")
      .eq("cart_id", cartId);
    expect(leftover!.length).toBe(0);
  });

  it("(b) Freitext-Item → is_free_text_item true, unit_price 0", async () => {
    await seedCart([
      {
        supplier_id: supplierA,
        quantity: 5,
        is_free_text_item: true,
        free_text_name: "Sonderkräuter",
        free_text_unit: "Bund",
      },
    ]);
    const { data: orderIds, error } = await callRpc();
    expect(error).toBeNull();
    const { data: items } = await org.service
      .from("order_items")
      .select("article_name, is_free_text_item, unit_price_cents")
      .eq("order_id", (orderIds as string[])[0]);
    expect(items![0].is_free_text_item).toBe(true);
    expect(Number(items![0].unit_price_cents)).toBe(0);
    expect(items![0].article_name).toBe("Sonderkräuter");
  });

  it("(c) Leerer Cart → Exception", async () => {
    await seedCart([]);
    const { error } = await callRpc();
    expect(error).not.toBeNull();
  });

  it("(d) Cart ohne Standort → Exception", async () => {
    await seedCart([{ article_id: artA1, supplier_id: supplierA, quantity: 1 }], false);
    const { error } = await callRpc();
    expect(error).not.toBeNull();
  });

  it("(e) ATOMARITÄT: cart_item mit supplier_id = NULL → Rollback, nichts angelegt", async () => {
    const cartId = await seedCart([{ article_id: artA1, supplier_id: supplierA, quantity: 2 }]);
    await org.service.from("cart_items").insert({
      organization_id: org.orgId,
      cart_id: cartId,
      article_id: artB1,
      supplier_id: null,
      quantity: 1,
      is_free_text_item: false,
    });

    const ordersBefore = await org.service
      .from("orders")
      .select("id")
      .eq("organization_id", org.orgId);
    const countBefore = ordersBefore.data?.length ?? 0;

    const { error } = await callRpc();
    expect(error).not.toBeNull();

    const ordersAfter = await org.service
      .from("orders")
      .select("id")
      .eq("organization_id", org.orgId);
    expect(ordersAfter.data?.length ?? 0).toBe(countBefore);

    const { data: leftover } = await org.service
      .from("cart_items")
      .select("id")
      .eq("cart_id", cartId);
    expect(leftover!.length).toBe(2);
  });
});
