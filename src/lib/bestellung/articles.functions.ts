// Server-Functions für Artikel-Stammdaten (Welle 1-B).
// Org-scoped, Manager+ für Schreibrechte, Preise in Cents (bigint).
// Kategorie ist Freitext (keine separate Tabelle), supplier_id ist Pflicht.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { runGuarded } from "@/lib/admin/admin-call";
import { writeAuditLog } from "@/lib/admin/audit";

function makeAuditWriter(caller: { organizationId: string; userId: string; staffId: string }) {
  return async (entry: {
    action: string;
    entity: string;
    entityId?: string;
    meta?: Record<string, unknown>;
  }) => {
    await writeAuditLog({
      organizationId: caller.organizationId,
      actorUserId: caller.userId,
      actorStaffId: caller.staffId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      meta: entry.meta,
    });
  };
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
    if (data.search) q = q.or(`name.ilike.%${data.search}%,sku.ilike.%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
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
      return {
        result: { id: row.id },
        audit: {
          action: "article.create",
          entity: "article",
          entityId: row.id,
          meta: { name: data.name, supplierId: data.supplierId, priceCents: data.priceCents },
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
      return {
        result: { ok: true as const },
        audit: {
          action: "article.update",
          entity: "article",
          entityId: data.articleId,
          meta: { name: data.name, priceCents: data.priceCents },
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
