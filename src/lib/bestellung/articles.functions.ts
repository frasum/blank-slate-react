// Server-Functions für Artikel-Stammdaten (Welle 1-B).
// Org-scoped, Manager+ für Schreibrechte, Preise in Cents (bigint).
// Kategorie ist Freitext (keine separate Tabelle), supplier_id ist Pflicht.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { runGuarded } from "@/lib/admin/admin-call";
import { makeAuditWriter } from "@/lib/admin/audit";

/**
 * Reduziert einen Suchbegriff auf eine sichere Allowlist (Unicode-Buchstaben,
 * Ziffern, Leerzeichen, Bindestrich). Entfernt PostgREST-DSL- und
 * ilike-Wildcard-Zeichen (`, . ( ) : * % _ \` u. a.), damit der Wert gefahrlos
 * in einen `.or()`-Filter interpoliert werden kann. Leerer Rest → Caller
 * sollte den Suchfilter weglassen.
 */
export function sanitizeArticleSearchTerm(value: string): string {
  return value.replace(/[^\p{L}\p{N} -]/gu, "").trim();
}

const ArticleInput = z.object({
  supplierId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  sku: z
    .string()
    .trim()
    .max(120)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  description: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  category: z
    .string()
    .trim()
    .max(120)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  unit: z.string().trim().min(1).max(40).default("Stk"),
  orderUnitId: z.string().uuid().optional().nullable(),
  priceCents: z.number().int().min(0),
  packagingUnit: z.number().int().min(1).optional().nullable(),
  imageUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  // Welle 3-A: optionale Wein-Felder. Für nicht-Weine bleiben sie leer/null.
  grapeVariety: z
    .string()
    .trim()
    .max(200)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  originCountry: z
    .string()
    .trim()
    .max(120)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  foodPairings: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  specialAttributes: z.array(z.string().trim().min(1).max(60)).optional().nullable(),
  locationIds: z.array(z.string().uuid()).min(1, "Mindestens ein Restaurant auswählen."),
});

export const listArticles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        supplierId: z.string().uuid().optional(),
        category: z.string().trim().min(1).max(120).optional(),
        search: z.string().trim().min(1).max(200).optional(),
        includeInactive: z.boolean().optional(),
        onlyWine: z.boolean().optional(),
      })
      .partial()
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("articles")
      .select(
        "id, supplier_id, name, sku, description, category, unit, order_unit_id, price_cents, packaging_unit, image_url, is_active, sort_order, created_at, updated_at, grape_variety, origin_country, food_pairings, special_attributes",
      )
      .eq("organization_id", caller.organizationId)
      .order("sort_order")
      .order("name");
    if (!data.includeInactive) q = q.eq("is_active", true);
    if (data.supplierId) q = q.eq("supplier_id", data.supplierId);
    if (data.category) q = q.eq("category", data.category);
    if (data.onlyWine) q = q.eq("category", "Wein");
    if (data.search) {
      const term = sanitizeArticleSearchTerm(data.search);
      if (term) q = q.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    const articleRows = rows ?? [];
    if (articleRows.length === 0) return [];
    const articleIds = new Set(articleRows.map((r) => r.id));
    const { data: links, error: linkErr } = await supabaseAdmin
      .from("article_locations")
      .select("article_id, location_id")
      .eq("organization_id", caller.organizationId);
    if (linkErr) throw linkErr;
    const byArticle = new Map<string, string[]>();
    for (const l of links ?? []) {
      if (!articleIds.has(l.article_id)) continue;
      const arr = byArticle.get(l.article_id) ?? [];
      arr.push(l.location_id);
      byArticle.set(l.article_id, arr);
    }
    return articleRows.map((r) => ({ ...r, locationIds: byArticle.get(r.id) ?? [] }));
  });

export const listArticleCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("articles")
      .select("category")
      .eq("organization_id", caller.organizationId)
      .not("category", "is", null);
    if (error) throw error;
    const set = new Set<string>();
    for (const r of data ?? []) {
      const c = (r as { category: string | null }).category;
      if (c && c.trim()) set.add(c.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "de"));
  });

export const createArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ArticleInput.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // Defensive: supplier muss zur selben Org gehören.
      const { data: sup, error: supErr } = await supabaseAdmin
        .from("suppliers")
        .select("id")
        .eq("id", data.supplierId)
        .eq("organization_id", caller.organizationId)
        .maybeSingle();
      if (supErr) throw supErr;
      if (!sup) throw new Error("Lieferant gehört nicht zur Organisation.");

      // Standort-IDs müssen zur Organisation gehören.
      const { data: validLocs, error: locErr } = await supabaseAdmin
        .from("locations")
        .select("id")
        .eq("organization_id", caller.organizationId)
        .in("id", data.locationIds);
      if (locErr) throw locErr;
      const validLocIds = new Set((validLocs ?? []).map((l) => l.id));
      if (validLocIds.size !== data.locationIds.length) {
        throw new Error("Mindestens ein Standort gehört nicht zur Organisation.");
      }

      const { data: row, error } = await supabaseAdmin
        .from("articles")
        .insert({
          organization_id: caller.organizationId,
          supplier_id: data.supplierId,
          name: data.name,
          sku: data.sku,
          description: data.description,
          category: data.category,
          unit: data.unit,
          order_unit_id: data.orderUnitId ?? null,
          price_cents: data.priceCents,
          packaging_unit: data.packagingUnit ?? null,
          image_url: data.imageUrl,
          sort_order: data.sortOrder ?? 0,
          grape_variety: data.grapeVariety,
          origin_country: data.originCountry,
          food_pairings: data.foodPairings,
          special_attributes: data.specialAttributes ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      const { error: alErr } = await supabaseAdmin.from("article_locations").insert(
        data.locationIds.map((locationId) => ({
          organization_id: caller.organizationId,
          article_id: row.id,
          location_id: locationId,
        })),
      );
      if (alErr) throw alErr;
      return {
        result: { id: row.id },
        audit: {
          action: "article.create",
          entity: "article",
          entityId: row.id,
          meta: {
            name: data.name,
            supplierId: data.supplierId,
            priceCents: data.priceCents,
            locationIds: data.locationIds,
          },
        },
      };
    });
  });

export const updateArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ArticleInput.extend({ articleId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: sup, error: supErr } = await supabaseAdmin
        .from("suppliers")
        .select("id")
        .eq("id", data.supplierId)
        .eq("organization_id", caller.organizationId)
        .maybeSingle();
      if (supErr) throw supErr;
      if (!sup) throw new Error("Lieferant gehört nicht zur Organisation.");

      const { data: validLocs, error: locErr } = await supabaseAdmin
        .from("locations")
        .select("id")
        .eq("organization_id", caller.organizationId)
        .in("id", data.locationIds);
      if (locErr) throw locErr;
      const validLocIds = new Set((validLocs ?? []).map((l) => l.id));
      if (validLocIds.size !== data.locationIds.length) {
        throw new Error("Mindestens ein Standort gehört nicht zur Organisation.");
      }

      const { error } = await supabaseAdmin
        .from("articles")
        .update({
          supplier_id: data.supplierId,
          name: data.name,
          sku: data.sku,
          description: data.description,
          category: data.category,
          unit: data.unit,
          order_unit_id: data.orderUnitId ?? null,
          price_cents: data.priceCents,
          packaging_unit: data.packagingUnit ?? null,
          image_url: data.imageUrl,
          sort_order: data.sortOrder ?? 0,
          grape_variety: data.grapeVariety,
          origin_country: data.originCountry,
          food_pairings: data.foodPairings,
          special_attributes: data.specialAttributes ?? null,
        })
        .eq("id", data.articleId)
        .eq("organization_id", caller.organizationId);
      if (error) throw error;
      // Standort-Zuordnung ersetzen.
      const { error: delErr } = await supabaseAdmin
        .from("article_locations")
        .delete()
        .eq("organization_id", caller.organizationId)
        .eq("article_id", data.articleId);
      if (delErr) throw delErr;
      const { error: insErr } = await supabaseAdmin.from("article_locations").insert(
        data.locationIds.map((locationId) => ({
          organization_id: caller.organizationId,
          article_id: data.articleId,
          location_id: locationId,
        })),
      );
      if (insErr) throw insErr;
      return {
        result: { ok: true as const },
        audit: {
          action: "article.update",
          entity: "article",
          entityId: data.articleId,
          meta: { name: data.name, priceCents: data.priceCents, locationIds: data.locationIds },
        },
      };
    });
  });

export const setArticleActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ articleId: z.string().uuid(), isActive: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin
        .from("articles")
        .update({ is_active: data.isActive })
        .eq("id", data.articleId)
        .eq("organization_id", caller.organizationId);
      if (error) throw error;
      return {
        result: { ok: true as const },
        audit: {
          action: data.isActive ? "article.activate" : "article.deactivate",
          entity: "article",
          entityId: data.articleId,
        },
      };
    });
  });
