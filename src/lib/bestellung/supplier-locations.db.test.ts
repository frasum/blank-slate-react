// SL1 — DB-Integrationstest für supplier_locations (RLS deny-all) und die
// zugehörigen create_order_from_cart-Guards (P0006 Artikel-Freigabe, P0007
// Lieferant standort-deaktiviert). Skips ohne SUPABASE_DB_TESTS — Muster
// exakt aus easyorder.db.test.ts / create-order-from-cart.db.test.ts
// übernommen.
//
// Geprüft:
//   (a) supplier_locations deny-all: Client (authenticated) sieht 0 Rows,
//       obwohl service_role vorher gesät hat. Kein Error erwartet — RLS
//       ohne Policies liefert leer.
//   (b) create_order_from_cart wirft P0006, wenn ein Cart-Artikel am
//       gewählten Standort nicht in article_locations freigegeben ist.
//   (c) create_order_from_cart wirft P0007, wenn der Lieferant an diesem
//       Standort per supplier_locations.is_active=false abgeschaltet ist.
//   (d) Fehlende supplier_locations-Zeile blockt NICHT.

import { describe, it, expect, beforeAll } from "vitest";
import {
  dbTestsEnabled,
  seedOrg,
  signInAsUser,
  type SeededOrg,
  type SeededUser,
} from "@/test/db-setup";

describe.skipIf(!dbTestsEnabled)("supplier_locations (DB)", () => {
  let org: SeededOrg;
  let user: SeededUser;
  let supplierA: string;
  let supplierB: string;
  let artA1: string;
  let artB1: string;
  let secondLocation: string;

  beforeAll(async () => {
    org = await seedOrg("supplier-locations");
    user = await org.mkUser("manager");

    await org.service
      .from("locations")
      .update({ street: "Hauptstr. 1", postal_code: "80331", city: "München" })
      .eq("id", org.defaultLocationId);
    secondLocation = await org.mkLocation("Filiale 2");

    const mkSupplier = async (name: string) => {
      const { data } = await org.service
        .from("suppliers")
        .insert({ organization_id: org.orgId, name, email: `${name}@x.com` })
        .select("id")
        .single();
      return data!.id as string;
    };
    supplierA = await mkSupplier("LiefA");
    supplierB = await mkSupplier("LiefB");

    const mkArt = async (sup: string, name: string, allowLocation: string | null) => {
      const { data } = await org.service
        .from("articles")
        .insert({
          organization_id: org.orgId,
          supplier_id: sup,
          name,
          price_cents: 100,
          unit: "Stk",
        })
        .select("id")
        .single();
      const articleId = data!.id as string;
      if (allowLocation) {
        await org.service.from("article_locations").insert({
          organization_id: org.orgId,
          article_id: articleId,
          location_id: allowLocation,
        });
      }
      return articleId;
    };
    // artA1 nur an secondLocation freigegeben → am defaultLocation blockiert
    artA1 = await mkArt(supplierA, "Tomaten", secondLocation);
    // artB1 am defaultLocation freigegeben
    artB1 = await mkArt(supplierB, "Olivenöl", org.defaultLocationId);
  });

  async function seedCart(items: Array<{ article_id: string; supplier_id: string }>) {
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
        location_id: org.defaultLocationId,
      })
      .select("id")
      .single();
    for (const it of items) {
      await org.service.from("cart_items").insert({
        organization_id: org.orgId,
        cart_id: cart!.id,
        article_id: it.article_id,
        supplier_id: it.supplier_id,
        quantity: 1,
      });
    }
  }

  async function callRpc() {
    return org.service.rpc("create_order_from_cart", {
      p_org_id: org.orgId,
      p_user_id: user.userId,
      p_notes: undefined,
    });
  }

  it("(a) supplier_locations deny-all: Client sieht 0 Rows trotz Seed", async () => {
    // service_role seedet eine Row
    await org.service.from("supplier_locations").upsert(
      {
        organization_id: org.orgId,
        supplier_id: supplierA,
        location_id: org.defaultLocationId,
        customer_number: "GEHEIM-123",
        is_active: true,
      },
      { onConflict: "supplier_id,location_id" },
    );

    const client = await signInAsUser(user.email, user.password);
    const { data, error } = await client.from("supplier_locations").select("id, customer_number");
    // RLS ohne Policies → keine Exception, aber leere Antwort.
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);

    // Aufräumen, damit die Row den anderen Tests nicht in die Quere kommt.
    await org.service
      .from("supplier_locations")
      .delete()
      .eq("organization_id", org.orgId)
      .eq("supplier_id", supplierA)
      .eq("location_id", org.defaultLocationId);
  });

  it("(b) P0006: Artikel nicht am gewählten Standort freigegeben", async () => {
    await seedCart([{ article_id: artA1, supplier_id: supplierA }]);
    const { error } = await callRpc();
    expect(error).not.toBeNull();
    expect(error!.code).toBe("P0006");
    expect(error!.message).toMatch(/Nicht bestellbar am gewählten Standort/);
  });

  it("(c) P0007: Lieferant an diesem Standort deaktiviert (is_active=false)", async () => {
    await org.service.from("supplier_locations").upsert(
      {
        organization_id: org.orgId,
        supplier_id: supplierB,
        location_id: org.defaultLocationId,
        is_active: false,
      },
      { onConflict: "supplier_id,location_id" },
    );
    await seedCart([{ article_id: artB1, supplier_id: supplierB }]);
    const { error } = await callRpc();
    expect(error).not.toBeNull();
    expect(error!.code).toBe("P0007");
    expect(error!.message).toMatch(/Lieferant am gewählten Standort deaktiviert/);

    await org.service
      .from("supplier_locations")
      .delete()
      .eq("organization_id", org.orgId)
      .eq("supplier_id", supplierB)
      .eq("location_id", org.defaultLocationId);
  });

  it("(d) Fehlende supplier_locations-Zeile blockt nicht", async () => {
    // Sicherstellen, dass KEINE Zeile für (supplierB, defaultLocation) existiert.
    await org.service
      .from("supplier_locations")
      .delete()
      .eq("organization_id", org.orgId)
      .eq("supplier_id", supplierB)
      .eq("location_id", org.defaultLocationId);
    await seedCart([{ article_id: artB1, supplier_id: supplierB }]);
    const { data, error } = await callRpc();
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });
});
