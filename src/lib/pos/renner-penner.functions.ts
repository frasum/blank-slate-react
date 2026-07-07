// RP1 — Server-Fn für den „Renner & Penner"-Tab. manager+.
//
// Datenrealität: sales_article_stats speichert EINEN kumulativen Snapshot
// je period ('d365' | 'alltime'). Aus diesen Snapshots lässt sich kein
// beliebiger Zeitraum ableiten — die Sicht wählt daher period statt
// from/to (Konflikt-Meldung im Chat vom 07.07.).
//
// Der Server joint sales_article_stats mit sales_articles (per Nummer +
// location) und liefert bereits die Felder, die das Core-Modul zum Mergen
// braucht. Ohne RPC — die vorgeschlagene renner_penner_stats-RPC würde
// über Tagesdaten aggregieren, die es nicht gibt.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { selectAllPaged } from "@/lib/supabase/select-all";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  aggregateRennerPenner,
  matchesGroupFilter,
  type RennerArticleForLeftovers,
  type RennerAggregateResult,
  type RennerRawRow,
} from "./renner-penner-core";

type Admin = SupabaseClient<Database>;

const Input = z.object({
  locationId: z.string().uuid(),
  period: z.enum(["d365", "alltime"]),
  /** Case-insensitive Match gegen hauptgruppe ODER warengruppe. Leere Liste = alle. */
  groups: z.array(z.string().min(1)).default([]),
});

export type RennerPennerInput = z.infer<typeof Input>;

export type RennerPennerResult = RennerAggregateResult & {
  reportDate: string | null;
  /** Distinct-Werte über alle Getränke-VAs — als Chip-Auswahl im UI. */
  groupOptions: string[];
};

async function assertLocationInOrg(admin: Admin, orgId: string, locationId: string) {
  const { data, error } = await admin
    .from("locations")
    .select("id")
    .eq("id", locationId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Standort gehört nicht zur aktiven Organisation.");
}

export const getRennerPenner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }): Promise<RennerPennerResult> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertLocationInOrg(supabaseAdmin, caller.organizationId, data.locationId);

    // Beide Datensätze paginiert lesen (BFIX2).
    const stats = await selectAllPaged<{
      nummer: number;
      verkauf_count: number;
      umsatz_cents: number;
      report_date: string;
    }>((from, to) =>
      supabaseAdmin
        .from("sales_article_stats")
        .select("id, nummer, verkauf_count, umsatz_cents, report_date")
        .eq("organization_id", caller.organizationId)
        .eq("location_id", data.locationId)
        .eq("period", data.period)
        .order("id", { ascending: true })
        .range(from, to),
    );

    const articles = await selectAllPaged<{
      id: string;
      nummer: number | null;
      name: string;
      hauptgruppe: string | null;
      warengruppe: string | null;
      is_active: boolean;
      ek_source_article_id: string | null;
      ek_portion_ml: number | null;
      ek_source_volume_ml: number | null;
      ek_price_cents: number | null;
      price_cents: number | null;
    }>((from, to) =>
      supabaseAdmin
        .from("sales_articles")
        .select(
          "id, nummer, name, hauptgruppe, warengruppe, is_active, ek_source_article_id, ek_portion_ml, ek_source_volume_ml, ek_price_cents, price_cents",
        )
        .eq("organization_id", caller.organizationId)
        .eq("location_id", data.locationId)
        .order("id", { ascending: true })
        .range(from, to),
    );

    // Index Verkaufsartikel nach nummer (nummer kann in VA null sein → dann kein Join).
    const vaByNummer = new Map<number, (typeof articles)[number]>();
    for (const a of articles) {
      if (a.nummer !== null && a.nummer !== undefined) {
        if (!vaByNummer.has(Number(a.nummer))) vaByNummer.set(Number(a.nummer), a);
      }
    }

    // Getränke-VAs (hauptgruppe/warengruppe vorhanden) für Chip-Auswahl + Ladenhüter.
    const drinkArticles = articles.filter((a) => a.is_active && (a.hauptgruppe || a.warengruppe));

    const groupSet = new Set<string>();
    for (const a of drinkArticles) {
      if (a.hauptgruppe) groupSet.add(a.hauptgruppe);
      if (a.warengruppe) groupSet.add(a.warengruppe);
    }
    const groupOptions = [...groupSet].sort((a, b) => a.localeCompare(b, "de"));

    // Rohzeilen aus stats × VA-Stammdaten. Ohne VA-Match landet die Zeile ohne
    // Gruppen und wird durch den Gruppenfilter herausgefiltert.
    const rawRows: RennerRawRow[] = [];
    for (const s of stats) {
      const va = vaByNummer.get(Number(s.nummer));
      if (!va) continue;
      const raw: RennerRawRow = {
        nummer: Number(s.nummer),
        name: va.name,
        hauptgruppe: va.hauptgruppe,
        warengruppe: va.warengruppe,
        verkaufCount: Number(s.verkauf_count),
        umsatzCents: Number(s.umsatz_cents),
        ekSourceArticleId: va.ek_source_article_id,
        ekPortionMl: va.ek_portion_ml === null ? null : Number(va.ek_portion_ml),
        ekSourceVolumeMl:
          va.ek_source_volume_ml === null ? null : Number(va.ek_source_volume_ml),
        ekPriceCents: va.ek_price_cents === null ? null : Number(va.ek_price_cents),
        priceCents: va.price_cents === null ? null : Number(va.price_cents),
      };
      if (!matchesGroupFilter(raw, data.groups)) continue;
      rawRows.push(raw);
    }

    const leftoverCandidates: RennerArticleForLeftovers[] = drinkArticles
      .filter((a) => matchesGroupFilter(a, data.groups))
      .filter((a) => a.nummer !== null && a.nummer !== undefined)
      .map((a) => ({
        nummer: Number(a.nummer),
        name: a.name,
        hauptgruppe: a.hauptgruppe,
        warengruppe: a.warengruppe,
      }));

    const aggregated = aggregateRennerPenner(rawRows, leftoverCandidates);

    const reportDate = stats.reduce<string | null>(
      (acc, s) => (acc === null || s.report_date > acc ? s.report_date : acc),
      null,
    );

    return {
      ...aggregated,
      reportDate,
      groupOptions,
    };
  });