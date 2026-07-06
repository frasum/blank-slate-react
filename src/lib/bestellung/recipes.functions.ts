// R1 — Server-Fns für das Rezeptur-Modul.
//
// Auth-Muster: `loadAdminCaller` mit erlaubten Rollen admin/manager/planer/staff
// (nur Verknüpfungsprüfung, kein Role-Rank-Check — der Rest läuft über
// `has_permission('recipes.manage', null)`). Rezepte sind org-weit und NICHT
// standort-gescopt — deshalb globaler Permission-Check (location=null) und
// KEIN `resolvePlanerScope`. Frank kann berechtigten Planern (z. B. Sumitr)
// per globalem Override (`location_id IS NULL`) das Recht geben; admin und
// manager haben es per Rollen-Default.
//
// Alle Schreibpfade laufen durch `runWithPermission` + `makeAuditWriter`.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { assertPermission, runWithPermission } from "@/lib/admin/admin-call";
import { makeAuditWriter } from "@/lib/admin/audit";
import { selectAllPaged } from "@/lib/supabase/select-all";
import {
  CycleError,
  DepthError,
  MAX_RECIPE_DEPTH,
  MissingContentError,
  MissingDataError,
  UnitMismatchError,
  costRecipeCents,
  type ArticleData,
  type CostingCtx,
  type RecipeData,
  type RecipeItemData,
  type RecipeUnit,
  type SubRecipeMeta,
} from "./recipe-costing";

const ALLOWED_ROLES = ["admin", "manager", "planer", "staff"] as const;

// ---------------------------------------------------------------------------
// Wiederkehrende Typen für die Rückgaben — bewusst schmal, damit die R2-UI
// nur bekommt, was sie zeichnet.
// ---------------------------------------------------------------------------

export type RecipeKind = "dish" | "sub";

export type RecipeListItem = {
  id: string;
  name: string;
  kind: RecipeKind;
  yieldQuantity: number | null;
  yieldUnit: RecipeUnit | null;
  updatedAt: string;
  usageCount: number; // #sales_articles + #recipe_items, die dieses Rezept nutzen
};

export type RecipeDetailItem = {
  id: string;
  position: number;
  articleId: string | null;
  subRecipeId: string | null;
  quantity: number;
  unit: RecipeUnit;
  lossPercent: number;
};

export type RecipeDetail = {
  id: string;
  name: string;
  kind: RecipeKind;
  yieldQuantity: number | null;
  yieldUnit: RecipeUnit | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  items: RecipeDetailItem[];
};

// ---------------------------------------------------------------------------
// listRecipeArticleCandidates — schlanke Lese-Fn für den R2-Editor.
// Liefert alle aktiven Einkaufsartikel der Org (mit Lieferantname und den
// Feldern, die pricePerBaseUnitCents braucht) sowie eine vollständige
// Rezept-Kaskade (Rezepte + Items + Sub-Meta). Der Editor baut daraus
// clientseitig einen CostingCtx, um Live-Kosten mit demselben Rechenkern
// wie der Server zu zeigen.
// ---------------------------------------------------------------------------

export type RecipeArticleCandidate = {
  id: string;
  name: string;
  supplierName: string | null;
  priceCents: number;
  orderToInventoryFactor: number;
  contentQuantity: number | null;
  contentUnit: RecipeUnit | null;
};

export type RecipeCandidateBundle = {
  articles: RecipeArticleCandidate[];
  recipes: Array<{
    id: string;
    name: string;
    kind: RecipeKind;
    yieldQuantity: number | null;
    yieldUnit: RecipeUnit | null;
    items: RecipeDetailItem[];
  }>;
};

export const listRecipeArticleCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RecipeCandidateBundle> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ALLOWED_ROLES);
    await assertPermission(context.supabase, "recipes.manage", null);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    type ArtRow = {
      id: string;
      name: string;
      price_cents: number;
      order_to_inventory_factor: number;
      content_quantity: number | null;
      content_unit: string | null;
      is_active: boolean;
      suppliers: { name: string | null } | null;
    };
    const artRows = await selectAllPaged<ArtRow>(() =>
      supabaseAdmin
        .from("articles")
        .select(
          "id, name, price_cents, order_to_inventory_factor, content_quantity, content_unit, is_active, suppliers:supplier_id(name)",
        )
        .eq("organization_id", caller.organizationId)
        .eq("is_active", true)
        .order("name", { ascending: true })
        .order("id", { ascending: true }),
    );

    type RecRow = {
      id: string;
      name: string;
      kind: string;
      yield_quantity: number | null;
      yield_unit: string | null;
    };
    const recRows = await selectAllPaged<RecRow>(() =>
      supabaseAdmin
        .from("recipes")
        .select("id, name, kind, yield_quantity, yield_unit")
        .eq("organization_id", caller.organizationId)
        .order("name", { ascending: true })
        .order("id", { ascending: true }),
    );

    type ItRow = {
      id: string;
      recipe_id: string;
      position: number;
      article_id: string | null;
      sub_recipe_id: string | null;
      quantity: number;
      unit: string;
      loss_percent: number;
    };
    const recIds = recRows.map((r) => r.id);
    const itemRows: ItRow[] =
      recIds.length === 0
        ? []
        : await selectAllPaged<ItRow>(() =>
            supabaseAdmin
              .from("recipe_items")
              .select(
                "id, recipe_id, position, article_id, sub_recipe_id, quantity, unit, loss_percent",
              )
              .in("recipe_id", recIds)
              .order("recipe_id", { ascending: true })
              .order("position", { ascending: true })
              .order("id", { ascending: true }),
          );

    const itemsByRecipe = new Map<string, RecipeDetailItem[]>();
    for (const it of itemRows) {
      const list = itemsByRecipe.get(it.recipe_id) ?? [];
      list.push({
        id: it.id,
        position: it.position,
        articleId: it.article_id,
        subRecipeId: it.sub_recipe_id,
        quantity: Number(it.quantity),
        unit: it.unit as RecipeUnit,
        lossPercent: Number(it.loss_percent),
      });
      itemsByRecipe.set(it.recipe_id, list);
    }

    return {
      articles: artRows.map((a) => ({
        id: a.id,
        name: a.name,
        supplierName: a.suppliers?.name ?? null,
        priceCents: Number(a.price_cents),
        orderToInventoryFactor: Number(a.order_to_inventory_factor),
        contentQuantity: a.content_quantity === null ? null : Number(a.content_quantity),
        contentUnit: a.content_unit as RecipeUnit | null,
      })),
      recipes: recRows.map((r) => ({
        id: r.id,
        name: r.name,
        kind: r.kind as RecipeKind,
        yieldQuantity: r.yield_quantity === null ? null : Number(r.yield_quantity),
        yieldUnit: r.yield_unit as RecipeUnit | null,
        items: itemsByRecipe.get(r.id) ?? [],
      })),
    };
  });

// ---------------------------------------------------------------------------
// listRecipes
// ---------------------------------------------------------------------------

const ListInput = z
  .object({
    kind: z.enum(["dish", "sub"]).optional(),
  })
  .default({});

export const listRecipes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ListInput.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<RecipeListItem[]> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ALLOWED_ROLES);
    await assertPermission(context.supabase, "recipes.manage", null);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    type Row = {
      id: string;
      name: string;
      kind: string;
      yield_quantity: number | null;
      yield_unit: string | null;
      updated_at: string;
    };
    const kindFilter = data.kind;
    const rows = await selectAllPaged<Row>(() => {
      const base = supabaseAdmin
        .from("recipes")
        .select("id, name, kind, yield_quantity, yield_unit, updated_at")
        .eq("organization_id", caller.organizationId)
        .order("name", { ascending: true })
        .order("id", { ascending: true });
      return kindFilter ? base.eq("kind", kindFilter) : base;
    });

    if (rows.length === 0) return [];

    // Verwendung: sales_articles.recipe_id + recipe_items.sub_recipe_id.
    const ids = rows.map((r) => r.id);
    const [salesUse, subUse] = await Promise.all([
      supabaseAdmin
        .from("sales_articles")
        .select("recipe_id")
        .eq("organization_id", caller.organizationId)
        .in("recipe_id", ids),
      supabaseAdmin.from("recipe_items").select("sub_recipe_id").in("sub_recipe_id", ids),
    ]);
    if (salesUse.error) throw new Error(salesUse.error.message);
    if (subUse.error) throw new Error(subUse.error.message);

    const counts = new Map<string, number>();
    for (const r of salesUse.data ?? []) {
      if (r.recipe_id) counts.set(r.recipe_id, (counts.get(r.recipe_id) ?? 0) + 1);
    }
    for (const r of subUse.data ?? []) {
      if (r.sub_recipe_id) counts.set(r.sub_recipe_id, (counts.get(r.sub_recipe_id) ?? 0) + 1);
    }

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind as RecipeKind,
      yieldQuantity: r.yield_quantity === null ? null : Number(r.yield_quantity),
      yieldUnit: r.yield_unit as RecipeUnit | null,
      updatedAt: r.updated_at,
      usageCount: counts.get(r.id) ?? 0,
    }));
  });

// ---------------------------------------------------------------------------
// getRecipe (Detail + Items)
// ---------------------------------------------------------------------------

const GetInput = z.object({ recipeId: z.string().uuid() });

export const getRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => GetInput.parse(input))
  .handler(async ({ data, context }): Promise<RecipeDetail> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ALLOWED_ROLES);
    await assertPermission(context.supabase, "recipes.manage", null);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: recipe, error } = await supabaseAdmin
      .from("recipes")
      .select(
        "id, organization_id, name, kind, yield_quantity, yield_unit, notes, created_at, updated_at",
      )
      .eq("id", data.recipeId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!recipe) throw new Error("Rezept nicht gefunden.");
    if (recipe.organization_id !== caller.organizationId) {
      throw new Error("Rezept gehört nicht zur aktiven Organisation.");
    }

    const { data: items, error: itErr } = await supabaseAdmin
      .from("recipe_items")
      .select("id, position, article_id, sub_recipe_id, quantity, unit, loss_percent")
      .eq("recipe_id", data.recipeId)
      .order("position", { ascending: true })
      .order("id", { ascending: true });
    if (itErr) throw new Error(itErr.message);

    return {
      id: recipe.id,
      name: recipe.name,
      kind: recipe.kind as RecipeKind,
      yieldQuantity: recipe.yield_quantity === null ? null : Number(recipe.yield_quantity),
      yieldUnit: recipe.yield_unit as RecipeUnit | null,
      notes: recipe.notes,
      createdAt: recipe.created_at,
      updatedAt: recipe.updated_at,
      items: (items ?? []).map((it) => ({
        id: it.id,
        position: it.position,
        articleId: it.article_id,
        subRecipeId: it.sub_recipe_id,
        quantity: Number(it.quantity),
        unit: it.unit as RecipeUnit,
        lossPercent: Number(it.loss_percent),
      })),
    };
  });

// ---------------------------------------------------------------------------
// upsertRecipe
// ---------------------------------------------------------------------------

const UpsertInput = z
  .object({
    recipeId: z.string().uuid().nullable().optional(),
    name: z.string().trim().min(1).max(200),
    kind: z.enum(["dish", "sub"]),
    yieldQuantity: z.number().positive().nullable().optional(),
    yieldUnit: z.enum(["g", "ml", "stk"]).nullable().optional(),
    notes: z.string().max(4000).nullable().optional(),
  })
  .refine(
    (v) =>
      v.kind === "sub"
        ? v.yieldQuantity !== null && v.yieldQuantity !== undefined && !!v.yieldUnit
        : (v.yieldQuantity === null || v.yieldQuantity === undefined) &&
          (v.yieldUnit === null || v.yieldUnit === undefined),
    { message: "Zwischenrezepte brauchen Ausbeute; Gerichte dürfen keine haben." },
  );

export const upsertRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpsertInput.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ALLOWED_ROLES);
    return runWithPermission(
      context.supabase,
      "recipes.manage",
      null,
      makeAuditWriter(caller),
      async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = new Date().toISOString();

        if (data.recipeId) {
          const { data: existing, error: exErr } = await supabaseAdmin
            .from("recipes")
            .select("id, organization_id, name, kind")
            .eq("id", data.recipeId)
            .maybeSingle();
          if (exErr) throw new Error(exErr.message);
          if (!existing) throw new Error("Rezept nicht gefunden.");
          if (existing.organization_id !== caller.organizationId) {
            throw new Error("Rezept gehört nicht zur aktiven Organisation.");
          }
          if (existing.kind !== data.kind) {
            // Wechsel dish↔sub würde den yield-CHECK und alle Sub-Nutzer treffen.
            throw new Error(
              "Rezeptart (Gericht/Zwischenrezept) kann nachträglich nicht gewechselt werden.",
            );
          }
          const { error: updErr } = await supabaseAdmin
            .from("recipes")
            .update({
              name: data.name,
              yield_quantity: data.yieldQuantity ?? null,
              yield_unit: data.yieldUnit ?? null,
              notes: data.notes ?? null,
              updated_at: now,
            })
            .eq("id", data.recipeId)
            .eq("organization_id", caller.organizationId);
          if (updErr) throw new Error(mapPgError(updErr.message));
          return {
            result: { id: data.recipeId },
            audit: {
              action: "recipe.updated",
              entity: "recipes",
              entityId: data.recipeId,
              meta: {
                name: data.name,
                kind: data.kind,
                yieldQuantity: data.yieldQuantity ?? null,
                yieldUnit: data.yieldUnit ?? null,
              },
            },
          };
        }

        const { data: created, error: insErr } = await supabaseAdmin
          .from("recipes")
          .insert({
            organization_id: caller.organizationId,
            name: data.name,
            kind: data.kind,
            yield_quantity: data.yieldQuantity ?? null,
            yield_unit: data.yieldUnit ?? null,
            notes: data.notes ?? null,
          })
          .select("id")
          .single();
        if (insErr) throw new Error(mapPgError(insErr.message));
        return {
          result: { id: created!.id as string },
          audit: {
            action: "recipe.created",
            entity: "recipes",
            entityId: created!.id as string,
            meta: {
              name: data.name,
              kind: data.kind,
              yieldQuantity: data.yieldQuantity ?? null,
              yieldUnit: data.yieldUnit ?? null,
            },
          },
        };
      },
    );
  });

// ---------------------------------------------------------------------------
// deleteRecipe (FK-RESTRICT-Fehler in verständliche Meldung übersetzen)
// ---------------------------------------------------------------------------

const DeleteInput = z.object({ recipeId: z.string().uuid() });

export const deleteRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DeleteInput.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ALLOWED_ROLES);
    return runWithPermission(
      context.supabase,
      "recipes.manage",
      null,
      makeAuditWriter(caller),
      async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: existing, error: exErr } = await supabaseAdmin
          .from("recipes")
          .select("id, organization_id, name")
          .eq("id", data.recipeId)
          .maybeSingle();
        if (exErr) throw new Error(exErr.message);
        if (!existing) throw new Error("Rezept nicht gefunden.");
        if (existing.organization_id !== caller.organizationId) {
          throw new Error("Rezept gehört nicht zur aktiven Organisation.");
        }

        // Verwendungscheck VORAB — ergibt bessere Meldung als der Roh-FK-Fehler.
        const [salesUse, subUse] = await Promise.all([
          supabaseAdmin
            .from("sales_articles")
            .select("name")
            .eq("organization_id", caller.organizationId)
            .eq("recipe_id", data.recipeId)
            .limit(5),
          supabaseAdmin
            .from("recipe_items")
            .select("recipe_id, recipes:recipes!recipe_items_recipe_id_fkey(name)")
            .eq("sub_recipe_id", data.recipeId)
            .limit(5),
        ]);
        if (salesUse.error) throw new Error(salesUse.error.message);
        if (subUse.error) throw new Error(subUse.error.message);

        const salesNames = (salesUse.data ?? []).map((r) => r.name);
        const subNames = (subUse.data ?? [])
          .map((r) => (r.recipes as { name: string } | null)?.name ?? "?")
          .filter((n) => n !== "?");
        if (salesNames.length + subNames.length > 0) {
          const parts: string[] = [];
          if (salesNames.length > 0) parts.push(`Verkaufsartikel: ${salesNames.join(", ")}`);
          if (subNames.length > 0) parts.push(`Rezepte: ${subNames.join(", ")}`);
          throw new Error(`Rezept wird noch verwendet von ${parts.join(" · ")}`);
        }

        const { error: delErr } = await supabaseAdmin
          .from("recipes")
          .delete()
          .eq("id", data.recipeId)
          .eq("organization_id", caller.organizationId);
        if (delErr) throw new Error(mapPgError(delErr.message));
        return {
          result: { ok: true },
          audit: {
            action: "recipe.deleted",
            entity: "recipes",
            entityId: data.recipeId,
            meta: { name: existing.name },
          },
        };
      },
    );
  });

// ---------------------------------------------------------------------------
// setRecipeItems — Replace-all mit vorheriger Validierung (Cross-Org,
// Einheiten-Regel, Zyklen-Check).
// ---------------------------------------------------------------------------

const ItemInput = z
  .object({
    articleId: z.string().uuid().nullable(),
    subRecipeId: z.string().uuid().nullable(),
    quantity: z.number().positive().max(1_000_000),
    unit: z.enum(["g", "ml", "stk"]),
    lossPercent: z.number().min(0).max(90),
  })
  .refine((v) => (v.articleId === null) !== (v.subRecipeId === null), {
    message: "Jede Zeile braucht genau EINE Zutat (Artikel ODER Zwischenrezept).",
  });

const SetItemsInput = z.object({
  recipeId: z.string().uuid(),
  items: z.array(ItemInput).max(200),
});

export const setRecipeItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SetItemsInput.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ALLOWED_ROLES);
    return runWithPermission(
      context.supabase,
      "recipes.manage",
      null,
      makeAuditWriter(caller),
      async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: target, error: tErr } = await supabaseAdmin
          .from("recipes")
          .select("id, organization_id, kind, name")
          .eq("id", data.recipeId)
          .maybeSingle();
        if (tErr) throw new Error(tErr.message);
        if (!target) throw new Error("Rezept nicht gefunden.");
        if (target.organization_id !== caller.organizationId) {
          throw new Error("Rezept gehört nicht zur aktiven Organisation.");
        }

        const articleIds = [
          ...new Set(data.items.map((i) => i.articleId).filter((x): x is string => !!x)),
        ];
        const subIds = [
          ...new Set(data.items.map((i) => i.subRecipeId).filter((x): x is string => !!x)),
        ];

        // Cross-Org + Einheiten: Artikel müssen zur Org gehören und content_unit
        // gesetzt haben, das mit der Zeilen-Einheit übereinstimmt.
        const articleMap = new Map<
          string,
          {
            id: string;
            content_unit: RecipeUnit | null;
            content_quantity: number | null;
            price_cents: number;
            order_to_inventory_factor: number;
            organization_id: string;
          }
        >();
        if (articleIds.length > 0) {
          const { data: arts, error } = await supabaseAdmin
            .from("articles")
            .select(
              "id, content_unit, content_quantity, price_cents, order_to_inventory_factor, organization_id",
            )
            .in("id", articleIds);
          if (error) throw new Error(error.message);
          for (const a of arts ?? []) {
            articleMap.set(a.id, {
              id: a.id,
              content_unit: (a.content_unit as RecipeUnit | null) ?? null,
              content_quantity: a.content_quantity === null ? null : Number(a.content_quantity),
              price_cents: Number(a.price_cents),
              order_to_inventory_factor: Number(a.order_to_inventory_factor),
              organization_id: a.organization_id,
            });
          }
        }

        // Sub-Rezepte: Org + kind='sub' + yield_unit.
        const subMap = new Map<
          string,
          { id: string; yield_unit: RecipeUnit; yield_quantity: number; kind: string }
        >();
        if (subIds.length > 0) {
          const { data: subs, error } = await supabaseAdmin
            .from("recipes")
            .select("id, organization_id, kind, yield_unit, yield_quantity")
            .in("id", subIds);
          if (error) throw new Error(error.message);
          for (const s of subs ?? []) {
            if (s.organization_id !== caller.organizationId) {
              throw new Error("Zwischenrezept gehört nicht zur aktiven Organisation.");
            }
            if (s.kind !== "sub" || !s.yield_unit || s.yield_quantity === null) {
              throw new Error(
                "Als Zutat verwendbare Rezepte müssen Zwischenrezepte mit Ausbeute sein.",
              );
            }
            subMap.set(s.id, {
              id: s.id,
              yield_unit: s.yield_unit as RecipeUnit,
              yield_quantity: Number(s.yield_quantity),
              kind: s.kind,
            });
          }
        }

        // Zeilen-Validierung.
        for (const [idx, it] of data.items.entries()) {
          if (it.articleId) {
            const art = articleMap.get(it.articleId);
            if (!art) throw new Error(`Zeile ${idx + 1}: Artikel nicht gefunden.`);
            if (art.organization_id !== caller.organizationId) {
              throw new Error(`Zeile ${idx + 1}: Artikel gehört nicht zur Organisation.`);
            }
            if (art.content_unit === null || art.content_quantity === null) {
              throw new Error(
                `Zeile ${idx + 1}: Artikel hat keinen Inhalt je Inventureinheit — bitte zuerst pflegen.`,
              );
            }
            if (art.content_unit !== it.unit) {
              throw new Error(
                `Zeile ${idx + 1}: Einheit muss "${art.content_unit}" sein (Artikel-Basiseinheit). Keine automatische Umrechnung.`,
              );
            }
          } else if (it.subRecipeId) {
            if (it.subRecipeId === data.recipeId) {
              throw new Error(
                `Zeile ${idx + 1}: Rezept kann sich nicht selbst als Zutat verwenden.`,
              );
            }
            const sub = subMap.get(it.subRecipeId);
            if (!sub) throw new Error(`Zeile ${idx + 1}: Zwischenrezept nicht gefunden.`);
            if (sub.yield_unit !== it.unit) {
              throw new Error(
                `Zeile ${idx + 1}: Einheit muss "${sub.yield_unit}" sein (Ausbeute-Einheit des Zwischenrezepts).`,
              );
            }
          }
        }

        // Zyklen-Check: würde das neue Item-Set einen Ring in der Sub-Graph
        // erzeugen? Wir laden die aktuelle Kante-Struktur aus recipe_items,
        // ersetzen die Kanten dieses Rezepts durch die neuen und suchen einen
        // Weg zurück zum recipeId.
        if (subIds.length > 0) {
          const { data: allEdges, error } = await supabaseAdmin
            .from("recipe_items")
            .select("recipe_id, sub_recipe_id")
            .not("sub_recipe_id", "is", null);
          if (error) throw new Error(error.message);
          const graph = new Map<string, Set<string>>();
          for (const e of allEdges ?? []) {
            if (!e.sub_recipe_id) continue;
            if (e.recipe_id === data.recipeId) continue; // eigene Kanten überschreiben
            const set = graph.get(e.recipe_id) ?? new Set<string>();
            set.add(e.sub_recipe_id);
            graph.set(e.recipe_id, set);
          }
          const newEdges = new Set<string>(subIds);
          graph.set(data.recipeId, newEdges);
          // Von jedem neuen Sub aus: erreicht der Pfad recipeId?
          const visited = new Set<string>();
          const stack: string[] = [...newEdges];
          while (stack.length > 0) {
            const cur = stack.pop()!;
            if (cur === data.recipeId) {
              throw new Error(
                "Zyklus erkannt: eine der gewählten Zutaten enthält dieses Rezept (direkt oder transitiv).",
              );
            }
            if (visited.has(cur)) continue;
            visited.add(cur);
            for (const next of graph.get(cur) ?? []) stack.push(next);
          }
          // Tiefen-Sicherung: längster Pfad von recipeId nach unten ≤ MAX.
          const depthFrom = (start: string): number => {
            let maxD = 0;
            const walk = (n: string, d: number) => {
              if (d > maxD) maxD = d;
              if (d >= MAX_RECIPE_DEPTH + 2) return; // Cap gegen theoretische Zyklen
              for (const nx of graph.get(n) ?? []) walk(nx, d + 1);
            };
            walk(start, 0);
            return maxD;
          };
          if (depthFrom(data.recipeId) > MAX_RECIPE_DEPTH) {
            throw new Error(
              `Rezept-Verschachtelung überschreitet ${MAX_RECIPE_DEPTH} Ebenen. Kette flacher halten.`,
            );
          }
        }

        // Replace-all.
        const { error: delErr } = await supabaseAdmin
          .from("recipe_items")
          .delete()
          .eq("recipe_id", data.recipeId);
        if (delErr) throw new Error(delErr.message);

        if (data.items.length > 0) {
          const rows = data.items.map((it, idx) => ({
            recipe_id: data.recipeId,
            position: idx,
            article_id: it.articleId,
            sub_recipe_id: it.subRecipeId,
            quantity: it.quantity,
            unit: it.unit,
            loss_percent: it.lossPercent,
          }));
          const { error: insErr } = await supabaseAdmin.from("recipe_items").insert(rows);
          if (insErr) throw new Error(mapPgError(insErr.message));
        }

        return {
          result: { count: data.items.length },
          audit: {
            action: "recipe.items_replaced",
            entity: "recipes",
            entityId: data.recipeId,
            meta: { recipeName: target.name, itemCount: data.items.length },
          },
        };
      },
    );
  });

// ---------------------------------------------------------------------------
// setArticleContent — content_quantity / content_unit pflegen. NUR diese
// beiden Felder anfassen (E1-Felder bleiben unangetastet).
// ---------------------------------------------------------------------------

const SetContentInput = z
  .object({
    articleId: z.string().uuid(),
    contentQuantity: z.number().positive().max(10_000_000).nullable(),
    contentUnit: z.enum(["g", "ml", "stk"]).nullable(),
  })
  .refine((v) => (v.contentQuantity === null) === (v.contentUnit === null), {
    message: "Inhalt und Einheit gemeinsam setzen oder gemeinsam leeren.",
  });

export const setArticleContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SetContentInput.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ALLOWED_ROLES);
    return runWithPermission(
      context.supabase,
      "recipes.manage",
      null,
      makeAuditWriter(caller),
      async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: art, error } = await supabaseAdmin
          .from("articles")
          .select("id, organization_id, name, content_quantity, content_unit")
          .eq("id", data.articleId)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!art) throw new Error("Einkaufsartikel nicht gefunden.");
        if (art.organization_id !== caller.organizationId) {
          throw new Error("Einkaufsartikel gehört nicht zur aktiven Organisation.");
        }

        const { error: updErr } = await supabaseAdmin
          .from("articles")
          .update({
            content_quantity: data.contentQuantity,
            content_unit: data.contentUnit,
            updated_at: new Date().toISOString(),
          })
          .eq("id", data.articleId)
          .eq("organization_id", caller.organizationId);
        if (updErr) throw new Error(updErr.message);

        return {
          result: { ok: true },
          audit: {
            action: "article.content_set",
            entity: "articles",
            entityId: data.articleId,
            meta: {
              articleName: art.name,
              before: {
                contentQuantity:
                  art.content_quantity === null ? null : Number(art.content_quantity),
                contentUnit: art.content_unit,
              },
              after: { contentQuantity: data.contentQuantity, contentUnit: data.contentUnit },
            },
          },
        };
      },
    );
  });

// ---------------------------------------------------------------------------
// linkSalesArticleRecipe / unlinkSalesArticleRecipe
// ---------------------------------------------------------------------------

const LinkSAInput = z.object({
  salesArticleId: z.string().uuid(),
  recipeId: z.string().uuid(),
});

export const linkSalesArticleRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => LinkSAInput.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ALLOWED_ROLES);
    return runWithPermission(
      context.supabase,
      "recipes.manage",
      null,
      makeAuditWriter(caller),
      async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: sales, error: sErr } = await supabaseAdmin
          .from("sales_articles")
          .select("id, organization_id, name, ek_source_article_id, ek_price_cents, recipe_id")
          .eq("id", data.salesArticleId)
          .maybeSingle();
        if (sErr) throw new Error(sErr.message);
        if (!sales) throw new Error("Verkaufsartikel nicht gefunden.");
        if (sales.organization_id !== caller.organizationId) {
          throw new Error("Verkaufsartikel gehört nicht zur aktiven Organisation.");
        }
        if (sales.ek_source_article_id !== null) {
          throw new Error(
            "Verkaufsartikel hat bereits eine 1:1-Verknüpfung. Bitte zuerst lösen, dann Rezept setzen.",
          );
        }

        const { data: recipe, error: rErr } = await supabaseAdmin
          .from("recipes")
          .select("id, organization_id, kind, name")
          .eq("id", data.recipeId)
          .maybeSingle();
        if (rErr) throw new Error(rErr.message);
        if (!recipe) throw new Error("Rezept nicht gefunden.");
        if (recipe.organization_id !== caller.organizationId) {
          throw new Error("Rezept gehört nicht zur aktiven Organisation.");
        }
        if (recipe.kind !== "dish") {
          throw new Error(
            "Nur Gerichte (kind='dish') können mit einem Verkaufsartikel verknüpft werden.",
          );
        }

        const { error: updErr } = await supabaseAdmin
          .from("sales_articles")
          .update({
            recipe_id: data.recipeId,
            ek_match_ignored: false,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sales.id)
          .eq("organization_id", caller.organizationId);
        if (updErr) throw new Error(mapPgError(updErr.message));

        return {
          result: { ok: true },
          audit: {
            action: "sales_article.recipe_linked",
            entity: "sales_articles",
            entityId: sales.id,
            meta: {
              salesArticleName: sales.name,
              recipeId: recipe.id,
              recipeName: recipe.name,
              ekBefore: sales.ek_price_cents,
            },
          },
        };
      },
    );
  });

const UnlinkSAInput = z.object({
  salesArticleId: z.string().uuid(),
  clearEk: z.boolean(),
});

export const unlinkSalesArticleRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UnlinkSAInput.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ALLOWED_ROLES);
    return runWithPermission(
      context.supabase,
      "recipes.manage",
      null,
      makeAuditWriter(caller),
      async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: sales, error } = await supabaseAdmin
          .from("sales_articles")
          .select("id, organization_id, name, recipe_id, ek_price_cents")
          .eq("id", data.salesArticleId)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!sales) throw new Error("Verkaufsartikel nicht gefunden.");
        if (sales.organization_id !== caller.organizationId) {
          throw new Error("Verkaufsartikel gehört nicht zur aktiven Organisation.");
        }
        if (sales.recipe_id === null) {
          throw new Error("Verkaufsartikel hat kein Rezept.");
        }

        const patch: { recipe_id: null; updated_at: string; ek_price_cents?: null } = {
          recipe_id: null,
          updated_at: new Date().toISOString(),
        };
        if (data.clearEk) patch.ek_price_cents = null;

        const { error: updErr } = await supabaseAdmin
          .from("sales_articles")
          .update(patch)
          .eq("id", sales.id)
          .eq("organization_id", caller.organizationId);
        if (updErr) throw new Error(updErr.message);

        return {
          result: { ok: true },
          audit: {
            action: "sales_article.recipe_unlinked",
            entity: "sales_articles",
            entityId: sales.id,
            meta: {
              salesArticleName: sales.name,
              previousRecipeId: sales.recipe_id,
              clearEk: data.clearEk,
              ekBefore: sales.ek_price_cents,
            },
          },
        };
      },
    );
  });

// ---------------------------------------------------------------------------
// Shared: Costing-Context aus DB für recalcAllLinkedEk und den späteren
// Editor-Preview. Lädt alle Rezepte + Items + Artikel einer Org paginiert.
// ---------------------------------------------------------------------------

export async function loadCostingCtxForOrganization(organizationId: string): Promise<CostingCtx> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  type ArtRow = {
    id: string;
    price_cents: number;
    order_to_inventory_factor: number;
    content_quantity: number | null;
    content_unit: string | null;
  };
  const artRows = await selectAllPaged<ArtRow>(() =>
    supabaseAdmin
      .from("articles")
      .select("id, price_cents, order_to_inventory_factor, content_quantity, content_unit")
      .eq("organization_id", organizationId)
      .order("id", { ascending: true }),
  );
  const articles = new Map<string, ArticleData>();
  for (const r of artRows) {
    articles.set(r.id, {
      id: r.id,
      priceCents: Number(r.price_cents),
      orderToInventoryFactor: Number(r.order_to_inventory_factor),
      contentQuantity: r.content_quantity === null ? null : Number(r.content_quantity),
      contentUnit: r.content_unit as RecipeUnit | null,
    });
  }

  type RecipeRow = {
    id: string;
    kind: string;
    yield_quantity: number | null;
    yield_unit: string | null;
  };
  const recipeRows = await selectAllPaged<RecipeRow>(() =>
    supabaseAdmin
      .from("recipes")
      .select("id, kind, yield_quantity, yield_unit")
      .eq("organization_id", organizationId)
      .order("id", { ascending: true }),
  );
  const subs = new Map<string, SubRecipeMeta>();
  for (const r of recipeRows) {
    if (r.kind === "sub" && r.yield_quantity !== null && r.yield_unit !== null) {
      subs.set(r.id, {
        id: r.id,
        yieldQuantity: Number(r.yield_quantity),
        yieldUnit: r.yield_unit as RecipeUnit,
      });
    }
  }

  type ItemRow = {
    id: string;
    recipe_id: string;
    position: number;
    article_id: string | null;
    sub_recipe_id: string | null;
    quantity: number;
    unit: string;
    loss_percent: number;
  };
  const recipeIds = recipeRows.map((r) => r.id);
  const items: ItemRow[] =
    recipeIds.length === 0
      ? []
      : await selectAllPaged<ItemRow>(() =>
          supabaseAdmin
            .from("recipe_items")
            .select(
              "id, recipe_id, position, article_id, sub_recipe_id, quantity, unit, loss_percent",
            )
            .in("recipe_id", recipeIds)
            .order("recipe_id", { ascending: true })
            .order("position", { ascending: true })
            .order("id", { ascending: true }),
        );

  const recipes = new Map<string, RecipeData>();
  for (const r of recipeRows) recipes.set(r.id, { id: r.id, items: [] });
  for (const it of items) {
    const recipe = recipes.get(it.recipe_id);
    if (!recipe) continue;
    const line: RecipeItemData = {
      id: it.id,
      articleId: it.article_id,
      subRecipeId: it.sub_recipe_id,
      quantity: Number(it.quantity),
      unit: it.unit as RecipeUnit,
      lossPercent: Number(it.loss_percent),
    };
    recipe.items.push(line);
  }

  return { articles, recipes, subs };
}

// Recalc-Kern: Für einen Sales-Article mit recipe_id neuen EK ermitteln.
// Wird von recalcAllLinkedEk (ek-linking.functions) verwendet.
export function recalcRecipeEkCents(
  recipeId: string,
  ctx: CostingCtx,
): { ok: true; ekCents: number } | { ok: false; reason: string } {
  try {
    return { ok: true, ekCents: costRecipeCents(recipeId, ctx) };
  } catch (e) {
    if (
      e instanceof MissingContentError ||
      e instanceof UnitMismatchError ||
      e instanceof CycleError ||
      e instanceof DepthError ||
      e instanceof MissingDataError
    ) {
      return { ok: false, reason: e.message };
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Interner Fehler-Mapper — Postgres-Meldungen in verständliches Deutsch.
// ---------------------------------------------------------------------------

function mapPgError(msg: string): string {
  if (/recipes_org_name_uq/i.test(msg)) return "Ein Rezept mit diesem Namen existiert bereits.";
  if (/recipes_yield_chk/i.test(msg))
    return "Ausbeute muss bei Zwischenrezepten gesetzt und bei Gerichten leer sein.";
  if (/recipe_items_source_xor/i.test(msg))
    return "Jede Zeile braucht genau eine Zutat (Artikel ODER Zwischenrezept).";
  if (/recipe_items_no_self/i.test(msg))
    return "Ein Rezept kann sich nicht selbst als Zutat verwenden.";
  if (/sales_articles_ek_source_xor/i.test(msg))
    return "Verkaufsartikel darf nicht gleichzeitig einen 1:1-Link und ein Rezept haben.";
  if (/sales_articles_ek_ignore_or_link/i.test(msg))
    return '„Ignoriert" schliesst 1:1-Link und Rezept aus.';
  return msg;
}
