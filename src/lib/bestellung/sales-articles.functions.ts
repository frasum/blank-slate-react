// VA1 — Verkaufsartikel (POS) je Standort.
//
// DENY-ALL auf sales_articles: kein Client-Zugriff, alle Reads/Writes gehen
// hier durch loadAdminCaller("manager") + supabaseAdmin. Schreibaktionen
// laufen durch runGuarded + Audit. organizationId wird ausschließlich aus
// dem Aufrufer abgeleitet, jede location_id vor dem Schreiben gegen die
// Org des Aufrufers validiert.
//
// Bewusst KEIN Delete-Pfad — Verkaufsartikel sind Auswertungs-Anker gegen
// Vectron-Umsätze und werden nur deaktiviert.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { runGuarded } from "@/lib/admin/admin-call";
import { makeAuditWriter } from "@/lib/admin/audit";
import type { Database } from "@/integrations/supabase/types";

type SalesArticleUpdate = Database["public"]["Tables"]["sales_articles"]["Update"];

type Admin = SupabaseClient<Database>;

export type SalesArticle = {
  id: string;
  locationId: string;
  name: string;
  productGroup: number | null;
  priceCents: number | null;
  takeawayPriceCents: number | null;
  isActive: boolean;
  updatedAt: string;
  warengruppe: string | null;
  untergruppe: string | null;
  untergruppeNr: number | null;
  hauptgruppe: string | null;
  hauptgruppeNr: number | null;
};


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function assertLocationInOrg(
  admin: Admin,
  organizationId: string,
  locationId: string,
): Promise<void> {
  const { data, error } = await admin
    // ST1: bewusst ungefiltert — Daten-Zugriff (assertLocationInOrg by id).
    .from("locations")
    .select("id")
    .eq("id", locationId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Standort gehört nicht zur aktiven Organisation.");
}

function mapRow(row: {
  id: string;
  location_id: string;
  name: string;
  product_group: number | null;
  price_cents: number | null;
  takeaway_price_cents: number | null;
  is_active: boolean;
  updated_at: string;
  warengruppe: string | null;
  untergruppe: string | null;
  untergruppe_nr: number | null;
  hauptgruppe: string | null;
  hauptgruppe_nr: number | null;
}): SalesArticle {
  return {
    id: row.id,
    locationId: row.location_id,
    name: row.name,
    productGroup: row.product_group,
    priceCents: row.price_cents === null ? null : Number(row.price_cents),
    takeawayPriceCents: row.takeaway_price_cents === null ? null : Number(row.takeaway_price_cents),
    isActive: row.is_active,
    updatedAt: row.updated_at,
    warengruppe: row.warengruppe,
    untergruppe: row.untergruppe,
    untergruppeNr: row.untergruppe_nr === null ? null : Number(row.untergruppe_nr),
    hauptgruppe: row.hauptgruppe,
    hauptgruppeNr: row.hauptgruppe_nr === null ? null : Number(row.hauptgruppe_nr),
  };
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

const ListInput = z.object({ locationId: z.string().uuid() });

export const listSalesArticles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ListInput.parse(input))
  .handler(async ({ data, context }): Promise<SalesArticle[]> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertLocationInOrg(supabaseAdmin, caller.organizationId, data.locationId);
    const { data: rows, error } = await supabaseAdmin
      .from("sales_articles")
      .select(
        "id, location_id, name, product_group, price_cents, takeaway_price_cents, is_active, updated_at, warengruppe, untergruppe, untergruppe_nr, hauptgruppe, hauptgruppe_nr",
      )
      .eq("organization_id", caller.organizationId)
      .eq("location_id", data.locationId)
      .order("hauptgruppe_nr", { ascending: true, nullsFirst: false })
      .order("untergruppe_nr", { ascending: true, nullsFirst: false })
      .order("product_group", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []).map(mapRow);
  });

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

const priceField = z.number().int().min(0).max(1_000_000_00).nullable().optional();

const CreateInput = z.object({
  locationId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  productGroup: z.number().int().nullable().optional(),
  priceCents: priceField,
  takeawayPriceCents: priceField,
  warengruppe: z.string().trim().max(200).nullable().optional(),
  untergruppe: z.string().trim().max(200).nullable().optional(),
  untergruppeNr: z.number().int().nullable().optional(),
  hauptgruppe: z.string().trim().max(200).nullable().optional(),
  hauptgruppeNr: z.number().int().nullable().optional(),
});

export const createSalesArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateInput.parse(input))
  .handler(async ({ data, context }): Promise<SalesArticle> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await assertLocationInOrg(supabaseAdmin, caller.organizationId, data.locationId);
      const insert = {
        organization_id: caller.organizationId,
        location_id: data.locationId,
        name: data.name,
        product_group: data.productGroup ?? null,
        price_cents: data.priceCents ?? null,
        takeaway_price_cents: data.takeawayPriceCents ?? null,
        is_active: true,
        warengruppe: data.warengruppe ?? null,
        untergruppe: data.untergruppe ?? null,
        untergruppe_nr: data.untergruppeNr ?? null,
        hauptgruppe: data.hauptgruppe ?? null,
        hauptgruppe_nr: data.hauptgruppeNr ?? null,
      };
      const { data: row, error } = await supabaseAdmin
        .from("sales_articles")
        .insert(insert)
        .select(
          "id, location_id, name, product_group, price_cents, takeaway_price_cents, is_active, updated_at, warengruppe, untergruppe, untergruppe_nr, hauptgruppe, hauptgruppe_nr",
        )
        .single();
      if (error) {
        if (error.code === "23505") {
          throw new Error(
            `Es gibt an diesem Standort bereits einen Verkaufsartikel „${data.name}".`,
          );
        }
        throw new Error(error.message);
      }
      const result = mapRow(row);
      return {
        result,
        audit: {
          action: "sales_article.created",
          entity: "sales_articles",
          entityId: result.id,
          meta: {
            locationId: result.locationId,
            name: result.name,
            productGroup: result.productGroup,
            priceCents: result.priceCents,
            takeawayPriceCents: result.takeawayPriceCents,
          },
        },
      };
    });
  });

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

const UpdateInput = z
  .object({
    id: z.string().uuid(),
    priceCents: priceField,
    takeawayPriceCents: priceField,
    productGroup: z.number().int().nullable().optional(),
    isActive: z.boolean().optional(),
    warengruppe: z.string().trim().max(200).nullable().optional(),
    untergruppe: z.string().trim().max(200).nullable().optional(),
    untergruppeNr: z.number().int().nullable().optional(),
    hauptgruppe: z.string().trim().max(200).nullable().optional(),
    hauptgruppeNr: z.number().int().nullable().optional(),
  })
  .refine(
    (v) =>
      v.priceCents !== undefined ||
      v.takeawayPriceCents !== undefined ||
      v.productGroup !== undefined ||
      v.isActive !== undefined ||
      v.warengruppe !== undefined ||
      v.untergruppe !== undefined ||
      v.untergruppeNr !== undefined ||
      v.hauptgruppe !== undefined ||
      v.hauptgruppeNr !== undefined,
    { message: "Keine Änderungen übergeben." },
  );

export const updateSalesArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateInput.parse(input))
  .handler(async ({ data, context }): Promise<SalesArticle> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: before, error: beforeErr } = await supabaseAdmin
        .from("sales_articles")
        .select(
          "id, organization_id, location_id, name, product_group, price_cents, takeaway_price_cents, is_active, updated_at, warengruppe, untergruppe, untergruppe_nr, hauptgruppe, hauptgruppe_nr",
        )
        .eq("id", data.id)
        .maybeSingle();
      if (beforeErr) throw new Error(beforeErr.message);
      if (!before) throw new Error("Verkaufsartikel nicht gefunden.");
      if (before.organization_id !== caller.organizationId) {
        throw new Error("Verkaufsartikel gehört nicht zur aktiven Organisation.");
      }

      const patch: SalesArticleUpdate = { updated_at: new Date().toISOString() };
      const changed: Record<string, { before: unknown; after: unknown }> = {};
      if (data.priceCents !== undefined && data.priceCents !== before.price_cents) {
        patch.price_cents = data.priceCents;
        changed.priceCents = { before: before.price_cents, after: data.priceCents };
      }
      if (
        data.takeawayPriceCents !== undefined &&
        data.takeawayPriceCents !== before.takeaway_price_cents
      ) {
        patch.takeaway_price_cents = data.takeawayPriceCents;
        changed.takeawayPriceCents = {
          before: before.takeaway_price_cents,
          after: data.takeawayPriceCents,
        };
      }
      if (data.productGroup !== undefined && data.productGroup !== before.product_group) {
        patch.product_group = data.productGroup;
        changed.productGroup = { before: before.product_group, after: data.productGroup };
      }
      if (data.isActive !== undefined && data.isActive !== before.is_active) {
        patch.is_active = data.isActive;
        changed.isActive = { before: before.is_active, after: data.isActive };
      }
      if (data.warengruppe !== undefined && data.warengruppe !== before.warengruppe) {
        patch.warengruppe = data.warengruppe;
        changed.warengruppe = { before: before.warengruppe, after: data.warengruppe };
      }
      if (data.untergruppe !== undefined && data.untergruppe !== before.untergruppe) {
        patch.untergruppe = data.untergruppe;
        changed.untergruppe = { before: before.untergruppe, after: data.untergruppe };
      }
      if (data.untergruppeNr !== undefined && data.untergruppeNr !== before.untergruppe_nr) {
        patch.untergruppe_nr = data.untergruppeNr;
        changed.untergruppeNr = { before: before.untergruppe_nr, after: data.untergruppeNr };
      }
      if (data.hauptgruppe !== undefined && data.hauptgruppe !== before.hauptgruppe) {
        patch.hauptgruppe = data.hauptgruppe;
        changed.hauptgruppe = { before: before.hauptgruppe, after: data.hauptgruppe };
      }
      if (data.hauptgruppeNr !== undefined && data.hauptgruppeNr !== before.hauptgruppe_nr) {
        patch.hauptgruppe_nr = data.hauptgruppeNr;
        changed.hauptgruppeNr = { before: before.hauptgruppe_nr, after: data.hauptgruppeNr };
      }

      // Nichts geändert? Bestehende Zeile zurückgeben, KEIN Audit-Eintrag.
      if (Object.keys(changed).length === 0) {
        return {
          result: mapRow(before),
          audit: {
            action: "sales_article.updated",
            entity: "sales_articles",
            entityId: before.id,
            meta: { locationId: before.location_id, noop: true },
          },
        };
      }

      const { data: row, error } = await supabaseAdmin
        .from("sales_articles")
        .update(patch)
        .eq("id", data.id)
        .eq("organization_id", caller.organizationId)
        .select(
          "id, location_id, name, product_group, price_cents, takeaway_price_cents, is_active, updated_at, warengruppe, untergruppe, untergruppe_nr, hauptgruppe, hauptgruppe_nr",
        )
        .single();
      if (error) throw new Error(error.message);
      const result = mapRow(row);
      return {
        result,
        audit: {
          action: "sales_article.updated",
          entity: "sales_articles",
          entityId: result.id,
          meta: { locationId: result.locationId, name: result.name, changed },
        },
      };
    });
  });
