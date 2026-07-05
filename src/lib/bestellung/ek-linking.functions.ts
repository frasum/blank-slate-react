// EKZ1 — Server-Fns für die EK-Zuordnungs-Werkbank.
//
// Alle Fns admin-only (EK ist Margen-Wissen, VA3-Linie). Schreibaktionen
// laufen durch runGuarded + Audit. Berechnung selbst passiert im pur-getesteten
// `ek-linking.ts` — hier nur I/O + Validierung + Audit.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { runGuarded } from "@/lib/admin/admin-call";
import { makeAuditWriter } from "@/lib/admin/audit";
import { computeEkFromLink } from "./ek-linking";
import type { Database } from "@/integrations/supabase/types";

type SalesArticleUpdate = Database["public"]["Tables"]["sales_articles"]["Update"];

export type PurchaseArticleHit = {
  id: string;
  name: string;
  supplierName: string | null;
  category: string | null;
  priceCents: number | null;
  packagingUnit: string | null;
  orderUnit: string | null;
};

// ---------------------------------------------------------------------------
// Typeahead-Suche im Einkaufsartikel-Katalog (admin-only, read-only).
// ---------------------------------------------------------------------------

const SearchInput = z.object({
  query: z.string().trim().min(1).max(120),
  limit: z.number().int().min(1).max(50).optional(),
});

// Getränke-Kategorien werden zuerst sortiert — Zuordnungsfall ist überwiegend
// Barbereich (Wein/Spirituosen/Bier/AF).
const BEVERAGE_CATEGORIES = new Set([
  "Wein",
  "Spirituosen",
  "Bier",
  "AF-Getränke",
  "Alkoholfrei",
  "Softdrinks",
  "Kaffee",
  "Tee",
]);

export const searchPurchaseArticlesForEk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SearchInput.parse(input))
  .handler(async ({ data, context }): Promise<PurchaseArticleHit[]> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const like = `%${data.query.replace(/[%_]/g, (m) => "\\" + m)}%`;
    const { data: rows, error } = await supabaseAdmin
      .from("articles")
      .select("id, name, category, price_cents, packaging_unit, order_unit, suppliers(name)")
      .eq("organization_id", caller.organizationId)
      .eq("is_active", true)
      .gt("price_cents", 0)
      .ilike("name", like)
      .order("name", { ascending: true })
      .limit(data.limit ?? 25);
    if (error) throw new Error(error.message);
    const mapped: PurchaseArticleHit[] = (rows ?? []).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      supplierName: (r.suppliers as { name: string } | null)?.name ?? null,
      category: (r.category as string | null) ?? null,
      priceCents: r.price_cents === null ? null : Number(r.price_cents),
      packagingUnit: (r.packaging_unit as string | null) ?? null,
      orderUnit: (r.order_unit as string | null) ?? null,
    }));
    // Getränke zuerst.
    mapped.sort((a, b) => {
      const av = BEVERAGE_CATEGORIES.has(a.category ?? "") ? 0 : 1;
      const bv = BEVERAGE_CATEGORIES.has(b.category ?? "") ? 0 : 1;
      if (av !== bv) return av - bv;
      return a.name.localeCompare(b.name, "de");
    });
    return mapped;
  });

// ---------------------------------------------------------------------------
// Verknüpfen: source-Artikel + Portion/Gebinde speichern, ek_price_cents cachen.
// ---------------------------------------------------------------------------

const LinkInput = z
  .object({
    salesArticleId: z.string().uuid(),
    sourceArticleId: z.string().uuid(),
    portionMl: z.number().int().positive().max(100_000).nullable().optional(),
    sourceVolumeMl: z.number().int().positive().max(100_000).nullable().optional(),
  })
  .refine(
    (v) =>
      (v.portionMl === null || v.portionMl === undefined) ===
      (v.sourceVolumeMl === null || v.sourceVolumeMl === undefined),
    { message: "Portion und Gebinde-ml gemeinsam setzen oder gemeinsam weglassen." },
  );

export const linkSalesArticleEk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => LinkInput.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      // 1) Verkaufsartikel laden + Org-Check.
      const { data: sales, error: salesErr } = await supabaseAdmin
        .from("sales_articles")
        .select("id, organization_id, location_id, name, ek_price_cents")
        .eq("id", data.salesArticleId)
        .maybeSingle();
      if (salesErr) throw new Error(salesErr.message);
      if (!sales) throw new Error("Verkaufsartikel nicht gefunden.");
      if (sales.organization_id !== caller.organizationId) {
        throw new Error("Verkaufsartikel gehört nicht zur aktiven Organisation.");
      }

      // 2) Einkaufsartikel laden + Org-Check + Preis prüfen.
      const { data: source, error: srcErr } = await supabaseAdmin
        .from("articles")
        .select("id, organization_id, name, price_cents")
        .eq("id", data.sourceArticleId)
        .maybeSingle();
      if (srcErr) throw new Error(srcErr.message);
      if (!source) throw new Error("Einkaufsartikel nicht gefunden.");
      if (source.organization_id !== caller.organizationId) {
        throw new Error("Einkaufsartikel gehört nicht zur aktiven Organisation.");
      }
      const sourcePriceCents = source.price_cents === null ? null : Number(source.price_cents);
      if (sourcePriceCents === null || sourcePriceCents <= 0) {
        throw new Error("Einkaufsartikel hat keinen Preis — Verknüpfung nicht möglich.");
      }

      // 3) EK berechnen (pure).
      const portionMl = data.portionMl ?? null;
      const sourceVolumeMl = data.sourceVolumeMl ?? null;
      const calc = computeEkFromLink({ sourcePriceCents, portionMl, sourceVolumeMl });
      if (!calc.ok) throw new Error(calc.error);

      // 4) Schreiben — ek_match_ignored zurücksetzen (Verknüpfung überstimmt).
      const { error: updErr } = await supabaseAdmin
        .from("sales_articles")
        .update({
          ek_source_article_id: source.id,
          ek_portion_ml: portionMl,
          ek_source_volume_ml: sourceVolumeMl,
          ek_price_cents: calc.ekCents,
          ek_match_ignored: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sales.id)
        .eq("organization_id", caller.organizationId);
      if (updErr) throw new Error(updErr.message);

      return {
        result: { ekCents: calc.ekCents },
        audit: {
          action: "sales_article.ek_linked",
          entity: "sales_articles",
          entityId: sales.id,
          meta: {
            locationId: sales.location_id,
            salesArticleName: sales.name,
            sourceArticleId: source.id,
            sourceArticleName: source.name,
            sourcePriceCents,
            portionMl,
            sourceVolumeMl,
            ekBefore: sales.ek_price_cents,
            ekAfter: calc.ekCents,
          },
        },
      };
    });
  });

// ---------------------------------------------------------------------------
// Entknüpfen: Verknüpfung löschen; EK optional als manueller Wert behalten.
// ---------------------------------------------------------------------------

const UnlinkInput = z.object({
  salesArticleId: z.string().uuid(),
  clearEk: z.boolean(),
});

export const unlinkSalesArticleEk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UnlinkInput.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: sales, error } = await supabaseAdmin
        .from("sales_articles")
        .select(
          "id, organization_id, location_id, name, ek_price_cents, ek_source_article_id, ek_portion_ml, ek_source_volume_ml",
        )
        .eq("id", data.salesArticleId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!sales) throw new Error("Verkaufsartikel nicht gefunden.");
      if (sales.organization_id !== caller.organizationId) {
        throw new Error("Verkaufsartikel gehört nicht zur aktiven Organisation.");
      }

      const patch: SalesArticleUpdate = {
        ek_source_article_id: null,
        ek_portion_ml: null,
        ek_source_volume_ml: null,
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
          action: "sales_article.ek_unlinked",
          entity: "sales_articles",
          entityId: sales.id,
          meta: {
            locationId: sales.location_id,
            salesArticleName: sales.name,
            previousSourceArticleId: sales.ek_source_article_id,
            previousPortionMl: sales.ek_portion_ml,
            previousSourceVolumeMl: sales.ek_source_volume_ml,
            clearEk: data.clearEk,
            ekBefore: sales.ek_price_cents,
            ekAfter: data.clearEk ? null : sales.ek_price_cents,
          },
        },
      };
    });
  });

// ---------------------------------------------------------------------------
// Ignorieren-Flag setzen (Aufschläge/Hausmixe bis zur Rezept-Welle).
// ---------------------------------------------------------------------------

const IgnoreInput = z.object({
  salesArticleId: z.string().uuid(),
  ignored: z.boolean(),
});

export const setEkMatchIgnored = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => IgnoreInput.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: sales, error } = await supabaseAdmin
        .from("sales_articles")
        .select("id, organization_id, location_id, name, ek_source_article_id, ek_match_ignored")
        .eq("id", data.salesArticleId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!sales) throw new Error("Verkaufsartikel nicht gefunden.");
      if (sales.organization_id !== caller.organizationId) {
        throw new Error("Verkaufsartikel gehört nicht zur aktiven Organisation.");
      }
      // DB-CHECK erlaubt ignored=true nur ohne Verknüpfung — proaktiv prüfen.
      if (data.ignored && sales.ek_source_article_id !== null) {
        throw new Error(
          "Zum Ignorieren erst die bestehende Verknüpfung lösen (Ignorieren + Verknüpfung schließen sich aus).",
        );
      }

      const { error: updErr } = await supabaseAdmin
        .from("sales_articles")
        .update({ ek_match_ignored: data.ignored, updated_at: new Date().toISOString() })
        .eq("id", sales.id)
        .eq("organization_id", caller.organizationId);
      if (updErr) throw new Error(updErr.message);

      return {
        result: { ok: true },
        audit: {
          action: "sales_article.ek_match_ignored_set",
          entity: "sales_articles",
          entityId: sales.id,
          meta: {
            locationId: sales.location_id,
            salesArticleName: sales.name,
            before: sales.ek_match_ignored,
            after: data.ignored,
          },
        },
      };
    });
  });

// ---------------------------------------------------------------------------
// Bulk-Neuberechnung: alle verknüpften EKs gegen aktuelle Einkaufspreise ziehen.
// ---------------------------------------------------------------------------

export const recalcAllLinkedEk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: linked, error } = await supabaseAdmin
        .from("sales_articles")
        .select(
          "id, ek_price_cents, ek_portion_ml, ek_source_volume_ml, ek_source_article_id, articles!sales_articles_ek_source_article_id_fkey(price_cents)",
        )
        .eq("organization_id", caller.organizationId)
        .not("ek_source_article_id", "is", null);
      if (error) throw new Error(error.message);

      let checked = 0;
      let changed = 0;
      const nowIso = new Date().toISOString();
      for (const row of linked ?? []) {
        checked += 1;
        const src = row.articles as { price_cents: number | null } | null;
        const srcPrice =
          src?.price_cents === null || src?.price_cents === undefined
            ? null
            : Number(src.price_cents);
        if (srcPrice === null || srcPrice <= 0) continue; // Preis weg → still liegen lassen.
        const calc = computeEkFromLink({
          sourcePriceCents: srcPrice,
          portionMl: row.ek_portion_ml,
          sourceVolumeMl: row.ek_source_volume_ml,
        });
        if (!calc.ok) continue;
        if (calc.ekCents === Number(row.ek_price_cents)) continue;
        const { error: upErr } = await supabaseAdmin
          .from("sales_articles")
          .update({ ek_price_cents: calc.ekCents, updated_at: nowIso })
          .eq("id", row.id as string)
          .eq("organization_id", caller.organizationId);
        if (upErr) throw new Error(upErr.message);
        changed += 1;
      }

      return {
        result: { checked, changed },
        audit: {
          action: "sales_article.ek_recalc_all",
          entity: "sales_articles",
          meta: { checked, changed },
        },
      };
    });
  });
