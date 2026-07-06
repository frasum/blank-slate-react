// R1 — DB-Integrationstest für das Rezeptur-Modul.
// Skips ohne SUPABASE_DB_TESTS (Muster wie easyorder.db.test.ts).
//
// Geprüft:
//   (a) `recipes` deny-all: authenticated-Client sieht 0 Rows, obwohl
//       service_role vorher gesät hat.
//   (b) `recipe_items` deny-all: dito.
//   (c) recipe_items_source_xor: Zeile ohne article_id UND ohne sub_recipe_id
//       schlägt fehl; Zeile mit BEIDEN schlägt ebenfalls fehl.
//   (d) recipe_items_no_self: Zeile mit sub_recipe_id = eigenem recipe_id
//       schlägt fehl.
//   (e) recipes_yield_chk: Zwischenrezept ohne Ausbeute schlägt fehl;
//       Gericht mit Ausbeute schlägt fehl.

import { describe, it, expect, beforeAll } from "vitest";
import {
  dbTestsEnabled,
  seedOrg,
  signInAsUser,
  type SeededOrg,
  type SeededUser,
} from "@/test/db-setup";

describe.skipIf(!dbTestsEnabled)("recipes (DB)", () => {
  let org: SeededOrg;
  let user: SeededUser;
  let seededRecipeId: string;
  let seededItemId: string;

  beforeAll(async () => {
    org = await seedOrg("recipes");
    user = await org.mkUser("manager");

    // Rezept + eine Artikel-Zeile via service_role säen.
    const { data: art } = await org.service
      .from("articles")
      .insert({
        organization_id: org.orgId,
        supplier_id: (
          await org.service
            .from("suppliers")
            .insert({ organization_id: org.orgId, name: "Lief", email: "l@x.com" })
            .select("id")
            .single()
        ).data!.id,
        name: "Zwiebel",
        price_cents: 100,
        unit: "kg",
        content_quantity: 1000,
        content_unit: "g",
      })
      .select("id")
      .single();

    const { data: recipe } = await org.service
      .from("recipes")
      .insert({ organization_id: org.orgId, name: "Zwiebelsuppe", kind: "dish" })
      .select("id")
      .single();
    seededRecipeId = recipe!.id as string;

    const { data: item } = await org.service
      .from("recipe_items")
      .insert({
        recipe_id: seededRecipeId,
        position: 0,
        article_id: art!.id,
        quantity: 100,
        unit: "g",
        loss_percent: 0,
      })
      .select("id")
      .single();
    seededItemId = item!.id as string;
  });

  it("recipes: authenticated-Client sieht keine Rows (RLS deny-all)", async () => {
    const client = await signInAsUser(user.email, user.password);
    const { data, error } = await client.from("recipes").select("id").eq("id", seededRecipeId);
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  it("recipe_items: authenticated-Client sieht keine Rows (RLS deny-all)", async () => {
    const client = await signInAsUser(user.email, user.password);
    const { data, error } = await client.from("recipe_items").select("id").eq("id", seededItemId);
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  it("recipe_items_source_xor: Zeile ohne Zutat wird abgelehnt", async () => {
    const { error } = await org.service.from("recipe_items").insert({
      recipe_id: seededRecipeId,
      position: 99,
      article_id: null,
      sub_recipe_id: null,
      quantity: 1,
      unit: "g",
      loss_percent: 0,
    });
    expect(error?.message ?? "").toMatch(/recipe_items_source_xor|check/i);
  });

  it("recipe_items_source_xor: Zeile mit beiden Zutaten wird abgelehnt", async () => {
    // Wir nutzen als sub das eigene Rezept — no_self greift dann später, aber
    // XOR fliegt zuerst, weil article_id UND sub_recipe_id gesetzt sind.
    // Für den Test brauchen wir eine Zweit-Rezept-ID (sub), damit no_self
    // nicht triggert und wir sauber die XOR-Regel testen.
    const { data: sub } = await org.service
      .from("recipes")
      .insert({
        organization_id: org.orgId,
        name: "Fond",
        kind: "sub",
        yield_quantity: 1000,
        yield_unit: "ml",
      })
      .select("id")
      .single();

    const { data: art } = await org.service
      .from("articles")
      .select("id")
      .eq("organization_id", org.orgId)
      .limit(1)
      .single();

    const { error } = await org.service.from("recipe_items").insert({
      recipe_id: seededRecipeId,
      position: 100,
      article_id: art!.id,
      sub_recipe_id: sub!.id,
      quantity: 1,
      unit: "g",
      loss_percent: 0,
    });
    expect(error?.message ?? "").toMatch(/recipe_items_source_xor|check/i);
  });

  it("recipe_items_no_self: Rezept referenziert sich selbst → Ablehnung", async () => {
    const { error } = await org.service.from("recipe_items").insert({
      recipe_id: seededRecipeId,
      position: 101,
      article_id: null,
      sub_recipe_id: seededRecipeId,
      quantity: 1,
      unit: "g",
      loss_percent: 0,
    });
    expect(error?.message ?? "").toMatch(/recipe_items_no_self|check/i);
  });

  it("recipes_yield_chk: Sub ohne Ausbeute wird abgelehnt", async () => {
    const { error } = await org.service.from("recipes").insert({
      organization_id: org.orgId,
      name: "SubOhneYield",
      kind: "sub",
    });
    expect(error?.message ?? "").toMatch(/recipes_yield_chk|check/i);
  });

  it("recipes_yield_chk: Gericht mit Ausbeute wird abgelehnt", async () => {
    const { error } = await org.service.from("recipes").insert({
      organization_id: org.orgId,
      name: "DishMitYield",
      kind: "dish",
      yield_quantity: 100,
      yield_unit: "g",
    });
    expect(error?.message ?? "").toMatch(/recipes_yield_chk|check/i);
  });
});