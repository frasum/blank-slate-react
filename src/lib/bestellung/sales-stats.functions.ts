// PV1 — POS-Verkaufsstatistik je Standort × Periode.
//
// DENY-ALL auf sales_article_stats: kein Client-Zugriff, alle Reads gehen
// hier durch loadAdminCaller("manager") + supabaseAdmin (VA1-Muster).
// organizationId wird ausschließlich aus dem Aufrufer abgeleitet, jede
// location_id vor dem Lesen gegen die Org des Aufrufers validiert.
//
// Kein Schreibpfad — Import läuft per Frank-SQL (Replace je Standort ×
// Periode). Server-seitig wird der weiche Namens-Join gegen sales_articles
// gemacht (siehe sales-stats.ts), damit die UI die drei VA2-Gruppenebenen
// filtern kann.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import type { Database } from "@/integrations/supabase/types";
import {
  enrichSalesStats,
  type EnrichedStatRow,
  type PosGroupOverride,
  type SalesArticleForJoin,
  type SalesStatRow,
} from "./sales-stats";

type Admin = SupabaseClient<Database>;

async function assertLocationInOrg(
  admin: Admin,
  organizationId: string,
  locationId: string,
): Promise<void> {
  const { data, error } = await admin
    .from("locations")
    .select("id")
    .eq("id", locationId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Standort gehört nicht zur aktiven Organisation.");
}

const ListInput = z.object({
  locationId: z.string().uuid(),
  period: z.enum(["d365", "alltime"]),
});

export type SalesStatsResult = {
  rows: EnrichedStatRow[];
  reportDate: string | null;
  unmatchedCount: number;
};

export const listSalesStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ListInput.parse(input))
  .handler(async ({ data, context }): Promise<SalesStatsResult> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertLocationInOrg(supabaseAdmin, caller.organizationId, data.locationId);

    const [statsRes, articlesRes] = await Promise.all([
      supabaseAdmin
        .from("sales_article_stats")
        .select("id, location_id, period, nummer, name, verkauf_count, umsatz_cents, report_date")
        .eq("organization_id", caller.organizationId)
        .eq("location_id", data.locationId)
        .eq("period", data.period),
      supabaseAdmin
        .from("sales_articles")
        .select(
          "name, warengruppe, product_group, untergruppe, untergruppe_nr, hauptgruppe, hauptgruppe_nr",
        )
        .eq("organization_id", caller.organizationId)
        .eq("location_id", data.locationId),
    ]);

    if (statsRes.error) throw new Error(statsRes.error.message);
    if (articlesRes.error) throw new Error(articlesRes.error.message);

    const overridesRes = await supabaseAdmin
      .from("sales_pos_group_overrides")
      .select(
        "nummer, warengruppe, product_group, untergruppe, untergruppe_nr, hauptgruppe, hauptgruppe_nr",
      )
      .eq("organization_id", caller.organizationId)
      .eq("location_id", data.locationId);
    if (overridesRes.error) throw new Error(overridesRes.error.message);

    const overrides: PosGroupOverride[] = (overridesRes.data ?? []).map((o) => ({
      nummer: Number(o.nummer),
      warengruppe: o.warengruppe,
      productGroup: o.product_group === null ? null : Number(o.product_group),
      untergruppe: o.untergruppe,
      untergruppeNr: o.untergruppe_nr === null ? null : Number(o.untergruppe_nr),
      hauptgruppe: o.hauptgruppe,
      hauptgruppeNr: o.hauptgruppe_nr === null ? null : Number(o.hauptgruppe_nr),
    }));

    const stats: SalesStatRow[] = (statsRes.data ?? []).map((r) => ({
      id: r.id,
      locationId: r.location_id,
      period: r.period === "alltime" ? "alltime" : "d365",
      nummer: Number(r.nummer),
      name: r.name,
      verkaufCount: Number(r.verkauf_count),
      umsatzCents: Number(r.umsatz_cents),
      reportDate: r.report_date,
    }));

    const articles: SalesArticleForJoin[] = (articlesRes.data ?? []).map((a) => ({
      name: a.name,
      warengruppe: a.warengruppe,
      productGroup: a.product_group === null ? null : Number(a.product_group),
      untergruppe: a.untergruppe,
      untergruppeNr: a.untergruppe_nr === null ? null : Number(a.untergruppe_nr),
      hauptgruppe: a.hauptgruppe,
      hauptgruppeNr: a.hauptgruppe_nr === null ? null : Number(a.hauptgruppe_nr),
    }));

    const { rows, unmatchedCount } = enrichSalesStats(stats, articles, overrides);
    const reportDate = stats.reduce<string | null>(
      (acc, s) => (acc === null || s.reportDate > acc ? s.reportDate : acc),
      null,
    );
    return { rows, reportDate, unmatchedCount };
  });

// ---------- Manuelles Zuordnen: warengruppeKey → Snapshot der 3 Ebenen ----------

const SetInput = z.object({
  locationId: z.string().uuid(),
  nummer: z.number().int(),
  /** Wert aus deriveWgOptions: entweder Warengruppen-Name oder `#<productGroup>`. */
  warengruppeKey: z.string().min(1),
});

const ClearInput = z.object({
  locationId: z.string().uuid(),
  nummer: z.number().int(),
});

function wgKeyOf(name: string | null, nr: number | null): string | null {
  if (name) return name;
  if (nr !== null) return `#${nr}`;
  return null;
}

export const setSalesStatsGroupOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SetInput.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertLocationInOrg(supabaseAdmin, caller.organizationId, data.locationId);

    const articlesRes = await supabaseAdmin
      .from("sales_articles")
      .select(
        "warengruppe, product_group, untergruppe, untergruppe_nr, hauptgruppe, hauptgruppe_nr",
      )
      .eq("organization_id", caller.organizationId)
      .eq("location_id", data.locationId);
    if (articlesRes.error) throw new Error(articlesRes.error.message);

    const exemplar = (articlesRes.data ?? []).find(
      (a) =>
        wgKeyOf(a.warengruppe, a.product_group === null ? null : Number(a.product_group)) ===
        data.warengruppeKey,
    );
    if (!exemplar) {
      throw new Error("Warengruppe nicht in den Verkaufsartikeln dieses Standorts gefunden.");
    }

    const upsert = {
      organization_id: caller.organizationId,
      location_id: data.locationId,
      nummer: data.nummer,
      warengruppe: exemplar.warengruppe,
      product_group: exemplar.product_group,
      untergruppe: exemplar.untergruppe,
      untergruppe_nr: exemplar.untergruppe_nr,
      hauptgruppe: exemplar.hauptgruppe,
      hauptgruppe_nr: exemplar.hauptgruppe_nr,
    };

    const { error } = await supabaseAdmin
      .from("sales_pos_group_overrides")
      .upsert(upsert, { onConflict: "location_id,nummer" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const clearSalesStatsGroupOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ClearInput.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertLocationInOrg(supabaseAdmin, caller.organizationId, data.locationId);

    const { error } = await supabaseAdmin
      .from("sales_pos_group_overrides")
      .delete()
      .eq("organization_id", caller.organizationId)
      .eq("location_id", data.locationId)
      .eq("nummer", data.nummer);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
