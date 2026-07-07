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
import { normalizeName } from "@/lib/bestellung/sales-stats";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  aggregateRennerPenner,
  matchesGroupFilter,
  mergeAcrossLocations,
  type RennerArticleForLeftovers,
  type RennerAggregateResult,
  type RennerEntry,
  type RennerRawRow,
} from "./renner-penner-core";

type Admin = SupabaseClient<Database>;

const Input = z.object({
  /** Ein oder mehrere Standorte. Bei > 1 liefert die Fn eine
   *  standort-übergreifende Rangliste inklusive per-Standort-Anteil. */
  locationIds: z.array(z.string().uuid()).min(1),
  period: z.enum(["d365", "alltime"]),
  /** Case-insensitive Match gegen hauptgruppe ODER warengruppe. Leere Liste = alle. */
  groups: z.array(z.string().min(1)).default([]),
});

export type RennerPennerInput = z.infer<typeof Input>;

export type RennerPennerResult = RennerAggregateResult & {
  reportDate: string | null;
  /** Distinct-Werte über alle Getränke-VAs — als Chip-Auswahl im UI. */
  groupOptions: string[];
  /** RP2 — Reihenfolge der ausgewählten Standorte (id + Name), für Legende/Farben. */
  locations: { id: string; name: string }[];
};

async function assertLocationInOrg(
  admin: Admin,
  orgId: string,
  locationId: string,
): Promise<{ id: string; name: string }> {
  const { data, error } = await admin
    .from("locations")
    .select("id, name")
    .eq("id", locationId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Standort gehört nicht zur aktiven Organisation.");
  return { id: data.id, name: data.name };
}

export const getRennerPenner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }): Promise<RennerPennerResult> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Reihenfolge stabil halten (Legende/Chart-Farben deterministisch).
    const locationInfos = await Promise.all(
      data.locationIds.map((id) => assertLocationInOrg(supabaseAdmin, caller.organizationId, id)),
    );

    const perLocationResults: Array<{
      locationId: string;
      locationName: string;
      entries: RennerEntry[];
      leftoverNames: Set<string>;
      leftoverArticles: RennerArticleForLeftovers[];
      groupOptions: string[];
      reportDate: string | null;
    }> = [];

    for (const loc of locationInfos) {
      const single = await loadForLocation(supabaseAdmin, caller.organizationId, loc, data);
      perLocationResults.push(single);
    }

    // Cross-location Merge (No-op bei 1 Standort).
    const mergedEntries = mergeAcrossLocations(
      perLocationResults.map((p) => ({
        locationId: p.locationId,
        locationName: p.locationName,
        entries: p.entries,
      })),
      normalizeName,
    );

    // Ladenhüter: normalisierter Name existiert in KEINEM gemergten Eintrag,
    // ist aber in mindestens einem Standort als aktives Getränk vorhanden.
    const soldNames = new Set<string>();
    for (const e of mergedEntries) soldNames.add(normalizeName(e.name));
    const leftoverByName = new Map<string, RennerArticleForLeftovers>();
    for (const p of perLocationResults) {
      for (const a of p.leftoverArticles) {
        const nk = normalizeName(a.name);
        if (soldNames.has(nk)) continue;
        if (!leftoverByName.has(nk)) leftoverByName.set(nk, a);
      }
    }

    const groupSet = new Set<string>();
    for (const p of perLocationResults) for (const g of p.groupOptions) groupSet.add(g);

    const reportDate = perLocationResults.reduce<string | null>(
      (acc, p) => (p.reportDate && (acc === null || p.reportDate > acc) ? p.reportDate : acc),
      null,
    );

    return {
      entries: mergedEntries,
      ladenhueter: [...leftoverByName.values()],
      reportDate,
      groupOptions: [...groupSet].sort((a, b) => a.localeCompare(b, "de")),
      locations: locationInfos,
    };
  });

async function loadForLocation(
  supabaseAdmin: Admin,
  organizationId: string,
  loc: { id: string; name: string },
  data: { period: "d365" | "alltime"; groups: string[] },
) {
  const stats = await selectAllPaged<{
      nummer: number;
      name: string;
      verkauf_count: number;
      umsatz_cents: number;
      report_date: string;
    }>((from, to) =>
      supabaseAdmin
        .from("sales_article_stats")
        .select("id, nummer, name, verkauf_count, umsatz_cents, report_date")
        .eq("organization_id", organizationId)
        .eq("location_id", loc.id)
        .eq("period", data.period)
        .order("id", { ascending: true })
        .range(from, to),
    );

    const articles = await selectAllPaged<{
      id: string;
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
          "id, name, hauptgruppe, warengruppe, is_active, ek_source_article_id, ek_portion_ml, ek_source_volume_ml, ek_price_cents, price_cents",
        )
        .eq("organization_id", organizationId)
        .eq("location_id", loc.id)
        .order("id", { ascending: true })
        .range(from, to),
    );

    const vaByName = new Map<string, (typeof articles)[number]>();
    for (const a of articles) {
      const key = normalizeName(a.name);
      if (!vaByName.has(key)) vaByName.set(key, a);
    }

    const drinkArticles = articles.filter((a) => a.is_active && (a.hauptgruppe || a.warengruppe));

    const groupSet = new Set<string>();
    for (const a of drinkArticles) {
      if (a.hauptgruppe) groupSet.add(a.hauptgruppe);
      if (a.warengruppe) groupSet.add(a.warengruppe);
    }
    const groupOptions = [...groupSet];

    const rawRows: RennerRawRow[] = [];
    for (const s of stats) {
      const va = vaByName.get(normalizeName(s.name));
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
        ekSourceVolumeMl: va.ek_source_volume_ml === null ? null : Number(va.ek_source_volume_ml),
        ekPriceCents: va.ek_price_cents === null ? null : Number(va.ek_price_cents),
        priceCents: va.price_cents === null ? null : Number(va.price_cents),
      };
      if (!matchesGroupFilter(raw, data.groups)) continue;
      rawRows.push(raw);
    }

    const seenNames = new Set<string>();
    for (const s of stats) seenNames.add(normalizeName(s.name));
    const leftoverCandidates: RennerArticleForLeftovers[] = drinkArticles
      .filter((a) => matchesGroupFilter(a, data.groups))
      .filter((a) => !seenNames.has(normalizeName(a.name)))
      .map((a, idx) => ({
        nummer: -1 - idx, // Platzhalter (nicht in stats vertreten)
        name: a.name,
        hauptgruppe: a.hauptgruppe,
        warengruppe: a.warengruppe,
      }));

  const aggregated = aggregateRennerPenner(rawRows, [], { id: loc.id, name: loc.name });

  const reportDate = stats.reduce<string | null>(
    (acc, s) => (acc === null || s.report_date > acc ? s.report_date : acc),
    null,
  );

  return {
    locationId: loc.id,
    locationName: loc.name,
    entries: aggregated.entries,
    leftoverNames: new Set(leftoverCandidates.map((l) => normalizeName(l.name))),
    leftoverArticles: leftoverCandidates,
    groupOptions,
    reportDate,
  };
}
