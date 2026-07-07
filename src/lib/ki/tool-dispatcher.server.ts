// KI1 — Serverseitige Ausführung der Tools. Wird nur aus `ask-coco.functions`
// aufgerufen (Handler-Body). Kein direkter Client-Import — `.server.ts`
// bleibt aus dem Browser-Bundle draußen.
//
// Regel: JEDES Tool delegiert an bestehende Kern-Module (aggregateRennerPenner,
// aggregatePersonnel, mapToSessionInputs …). KEINE Zweitimplementierung —
// wir bauen nur den Datenzuschnitt (Query + Rückgabe-Shape für das Modell).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { selectAllPaged } from "@/lib/supabase/select-all";
import { normalizeName } from "@/lib/bestellung/sales-stats";
import { grossMinutesBetween } from "@/lib/time/break-rules";
import { primaryDepartment, type Department } from "@/lib/time/primary-department";
import {
  aggregateRennerPenner,
  matchesGroupFilter,
  mergeAcrossLocations,
  type RennerEntry,
  type RennerRawRow,
} from "@/lib/pos/renner-penner-core";
import { aggregatePersonnel, type CompRow, type WorkEntry } from "@/lib/statistics/personnel-core";
import { aggregateByBusinessDate, summarize } from "@/lib/statistics/revenue-core";
import { mapToSessionInputs, type ChannelAmountRow, type SessionRow } from "@/lib/statistics/revenue-map";
import { computePresets } from "./period-resolver";
import type { ToolName } from "./tools";
import { pseudonymizeDeep, type PseudonymMap } from "./pseudonym";

type Admin = SupabaseClient<Database>;

export type ToolContext = {
  admin: Admin;
  organizationId: string;
  /** Pseudonymisierungs-Map — Tools mit Personenbezug (arbeitsstunden,
   *  abwesenheiten) wenden sie auf ihr Ergebnis an, damit der Modell-Input
   *  garantiert keine Klarnamen enthält. */
  pseudonym: PseudonymMap;
};

/** Fehler, den das Modell als tool_result mit is_error=true sehen soll. */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireDate(input: unknown, field: string): string {
  if (typeof input !== "string" || !ISO_DATE.test(input)) {
    throw new ToolError(`Parameter '${field}' fehlt oder ist kein ISO-Datum YYYY-MM-DD.`);
  }
  return input;
}
function optionalUuid(input: unknown, field: string): string | undefined {
  if (input === undefined || input === null || input === "") return undefined;
  if (typeof input !== "string" || !UUID_RE.test(input)) {
    throw new ToolError(`Parameter '${field}' ist keine gültige UUID.`);
  }
  return input;
}
function requireRange(a: unknown, b: unknown) {
  const from = requireDate(a, "from");
  const to = requireDate(b, "to");
  if (to < from) throw new ToolError("'to' muss >= 'from' sein.");
  return { from, to };
}

/** Eintrittspunkt. Wirft ToolError bei Nutzer-/Parameterfehlern. */
export async function runTool(
  ctx: ToolContext,
  name: ToolName,
  input: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "stammdaten_lookup":
      return await stammdatenLookup(ctx, input);
    case "getraenke_ranking":
      return await getraenkeRanking(ctx, input);
    case "umsatz_zeitraum":
      return await umsatzZeitraum(ctx, input);
    case "arbeitsstunden":
      return await arbeitsstunden(ctx, input);
    case "abwesenheiten":
      return await abwesenheiten(ctx, input);
    case "personalkosten_quote":
      return await personalkostenQuote(ctx, input);
  }
}

// ───────────────────────────────────────────────────────────────── Tools ────

async function stammdatenLookup(ctx: ToolContext, input: Record<string, unknown>) {
  const art = String(input.art ?? "");
  if (art === "warengruppen") {
    const rows = await selectAllPaged<{
      hauptgruppe: string | null;
      warengruppe: string | null;
      is_active: boolean;
    }>((from, to) =>
      ctx.admin
        .from("sales_articles")
        .select("hauptgruppe, warengruppe, is_active")
        .eq("organization_id", ctx.organizationId)
        .eq("is_active", true)
        .order("hauptgruppe", { ascending: true, nullsFirst: false })
        .range(from, to),
    );
    const set = new Set<string>();
    for (const r of rows) {
      if (r.hauptgruppe) set.add(r.hauptgruppe);
      if (r.warengruppe) set.add(r.warengruppe);
    }
    return {
      warengruppen: [...set].sort((a, b) => a.localeCompare(b, "de")),
      hinweis: "Namen sind case-insensitiv, sowohl hauptgruppe als auch warengruppe.",
    };
  }
  if (art === "standorte") {
    const { data, error } = await ctx.admin
      .from("locations")
      .select("id, name")
      .eq("organization_id", ctx.organizationId)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return { standorte: (data ?? []).map((l) => ({ id: l.id, name: l.name })) };
  }
  if (art === "zeitraum_presets") {
    const presets = computePresets(new Date());
    return {
      heute: presets[0]!.from,
      presets,
      hinweis:
        "Wenn der Nutzer 'letzter Monat', 'letzte Woche' etc. sagt, nimm exakt den zugehörigen Preset-Zeitraum und nenne ihn im Antworttext.",
    };
  }
  throw new ToolError(`Unbekannte Stammdaten-Art: ${art}`);
}

async function getraenkeRanking(ctx: ToolContext, input: Record<string, unknown>) {
  const period = input.period === "alltime" ? "alltime" : "d365";
  const gruppen = Array.isArray(input.gruppen)
    ? (input.gruppen as unknown[]).filter((g): g is string => typeof g === "string" && g.length > 0)
    : [];
  const locationId = optionalUuid(input.location_id, "location_id");
  const topN = Math.min(Math.max(Number(input.top_n ?? 10) | 0, 1), 20);

  // Ziel-Standorte auflösen: entweder nur einer, oder alle der Org.
  const { data: locs, error: locErr } = await ctx.admin
    .from("locations")
    .select("id, name")
    .eq("organization_id", ctx.organizationId);
  if (locErr) throw new Error(locErr.message);
  const scope = locationId
    ? (locs ?? []).filter((l) => l.id === locationId)
    : (locs ?? []);
  if (scope.length === 0) throw new ToolError("Keine Standorte im Scope.");

  const perLoc: { locationId: string; locationName: string; entries: RennerEntry[]; reportDate: string | null }[] = [];
  for (const loc of scope) {
    const single = await loadRankingForLocation(ctx, loc, period, gruppen);
    perLoc.push(single);
  }
  const merged = mergeAcrossLocations(
    perLoc.map((p) => ({
      locationId: p.locationId,
      locationName: p.locationName,
      entries: p.entries,
    })),
    normalizeName,
  );

  const byUmsatz = [...merged].sort((a, b) => b.umsatzCents - a.umsatzCents).slice(0, topN);
  const byMenge = [...merged].sort((a, b) => b.einheitenGesamt - a.einheitenGesamt).slice(0, topN);
  const bottomUmsatz = [...merged]
    .filter((e) => e.einheitenGesamt > 0)
    .sort((a, b) => a.umsatzCents - b.umsatzCents)
    .slice(0, topN);

  const reportDate = perLoc.reduce<string | null>(
    (acc, p) => (p.reportDate && (acc === null || p.reportDate > acc) ? p.reportDate : acc),
    null,
  );

  const shape = (e: RennerEntry) => ({
    name: e.name,
    hauptgruppe: e.hauptgruppe,
    warengruppe: e.warengruppe,
    umsatz_eur: Math.round(e.umsatzCents) / 100,
    einheiten: e.einheitenGesamt,
    flaschen_aequivalent: e.flaschenAequivalent,
    offene_glaeser: e.offeneGlaeserCount,
    flaschen: e.flaschenCount,
    ekw_pct: e.ekwPct,
    db_eur: e.dbCents === null ? null : Math.round(e.dbCents) / 100,
  });

  return {
    period,
    scope: scope.map((s) => s.name),
    report_date: reportDate,
    hinweis:
      "period='d365' = Snapshot letzte 365 Tage, 'alltime' = Gesamt. Beliebige Datumsfenster sind hier nicht möglich.",
    top_umsatz: byUmsatz.map(shape),
    top_menge: byMenge.map(shape),
    penner_umsatz: bottomUmsatz.map(shape),
  };
}

async function loadRankingForLocation(
  ctx: ToolContext,
  loc: { id: string; name: string },
  period: "d365" | "alltime",
  gruppen: string[],
) {
  const stats = await selectAllPaged<{
    nummer: number;
    name: string;
    verkauf_count: number;
    umsatz_cents: number;
    report_date: string;
  }>((from, to) =>
    ctx.admin
      .from("sales_article_stats")
      .select("id, nummer, name, verkauf_count, umsatz_cents, report_date")
      .eq("organization_id", ctx.organizationId)
      .eq("location_id", loc.id)
      .eq("period", period)
      .order("id", { ascending: true })
      .range(from, to),
  );
  const articles = await selectAllPaged<{
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
    ctx.admin
      .from("sales_articles")
      .select(
        "name, hauptgruppe, warengruppe, is_active, ek_source_article_id, ek_portion_ml, ek_source_volume_ml, ek_price_cents, price_cents",
      )
      .eq("organization_id", ctx.organizationId)
      .eq("location_id", loc.id)
      .order("name", { ascending: true })
      .range(from, to),
  );
  const vaByName = new Map<string, (typeof articles)[number]>();
  for (const a of articles) {
    const key = normalizeName(a.name);
    if (!vaByName.has(key)) vaByName.set(key, a);
  }
  const raw: RennerRawRow[] = [];
  for (const s of stats) {
    const va = vaByName.get(normalizeName(s.name));
    if (!va) continue;
    const row: RennerRawRow = {
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
    if (!matchesGroupFilter(row, gruppen)) continue;
    raw.push(row);
  }
  const agg = aggregateRennerPenner(raw, [], { id: loc.id, name: loc.name });
  const reportDate = stats.reduce<string | null>(
    (acc, s) => (acc === null || s.report_date > acc ? s.report_date : acc),
    null,
  );
  return {
    locationId: loc.id,
    locationName: loc.name,
    entries: agg.entries,
    reportDate,
  };
}

async function umsatzZeitraum(ctx: ToolContext, input: Record<string, unknown>) {
  const { from, to } = requireRange(input.from, input.to);
  const locationId = optionalUuid(input.location_id, "location_id");

  let q = ctx.admin
    .from("sessions")
    .select("id, business_date, location_id, vectron_daily_total_cents")
    .eq("organization_id", ctx.organizationId)
    .gte("business_date", from)
    .lte("business_date", to);
  if (locationId) q = q.eq("location_id", locationId);
  const { data: sess, error } = await q;
  if (error) throw new Error(error.message);

  const sessions: SessionRow[] = (sess ?? []).map((r) => ({
    id: r.id as string,
    businessDate: r.business_date as string,
    locationId: r.location_id as string,
    vectronCents: (r.vectron_daily_total_cents as number | null) ?? 0,
  }));

  let channels: ChannelAmountRow[] = [];
  if (sessions.length > 0) {
    const ids = sessions.map((s) => s.id);
    const { data: ch, error: chErr } = await ctx.admin
      .from("session_channel_amounts")
      .select("session_id, amount_cents, revenue_channels(is_takeaway)")
      .eq("organization_id", ctx.organizationId)
      .in("session_id", ids)
      .returns<
        {
          session_id: string;
          amount_cents: number;
          revenue_channels: { is_takeaway: boolean } | null;
        }[]
      >();
    if (chErr) throw new Error(chErr.message);
    channels = (ch ?? []).map((r) => ({
      sessionId: r.session_id,
      amountCents: r.amount_cents,
      isTakeaway: r.revenue_channels?.is_takeaway ?? false,
    }));
  }

  const daily = aggregateByBusinessDate(mapToSessionInputs(sessions, channels));
  const sum = summarize(daily);

  return {
    range: { from, to },
    umsatz_eur: sum.totalCents / 100,
    umsatz_haus_eur: sum.houseCents / 100,
    umsatz_takeaway_eur: sum.takeawayCents / 100,
    tage_mit_umsatz: sum.daysWithRevenue,
    session_count: sessions.length,
  };
}

async function arbeitsstunden(ctx: ToolContext, input: Record<string, unknown>) {
  const { from, to } = requireRange(input.from, input.to);
  const locationId = optionalUuid(input.location_id, "location_id");
  const rawDept = typeof input.department === "string" ? input.department : undefined;
  const dept =
    rawDept === "kueche" || rawDept === "kitchen"
      ? "kitchen"
      : rawDept === "service"
        ? "service"
        : undefined;

  let q = ctx.admin
    .from("time_entries")
    .select("staff_id, started_at, ended_at, break_minutes, business_date, location_id, staff(display_name)")
    .eq("organization_id", ctx.organizationId)
    .gte("business_date", from)
    .lte("business_date", to)
    .not("ended_at", "is", null);
  if (locationId) q = q.eq("location_id", locationId);
  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);

  // Standort-Departments — für Filter/Bericht.
  const { data: deptRows, error: deptErr } = await ctx.admin
    .from("staff_locations")
    .select("staff_id, location_id, department");
  if (deptErr) throw new Error(deptErr.message);
  const deptByStaffLocation = new Map<string, string>();
  const grouped = new Map<string, Department[]>();
  const byStaffLoc = new Map<string, Department[]>();
  for (const r of deptRows ?? []) {
    const key = `${r.location_id as string}|${r.staff_id as string}`;
    const arr = byStaffLoc.get(key) ?? [];
    arr.push(r.department as Department);
    byStaffLoc.set(key, arr);
  }
  for (const [key, depts] of byStaffLoc) {
    deptByStaffLocation.set(key, primaryDepartment(depts));
  }
  void grouped;

  type Agg = { netMinutes: number; department: string; displayName: string };
  const perStaff = new Map<string, Agg>();
  let totalNet = 0;
  let totalGross = 0;
  for (const r of rows ?? []) {
    if (!r.ended_at || !r.started_at) continue;
    const gross = grossMinutesBetween(new Date(r.started_at), new Date(r.ended_at));
    const net = Math.max(0, gross - Number(r.break_minutes ?? 0));
    const d =
      deptByStaffLocation.get(`${r.location_id as string}|${r.staff_id as string}`) ?? "service";
    if (dept && d !== dept) continue;
    totalNet += net;
    totalGross += gross;
    const cur = perStaff.get(r.staff_id as string) ?? {
      netMinutes: 0,
      department: d,
      displayName:
        (r.staff as { display_name: string } | null)?.display_name ?? String(r.staff_id),
    };
    cur.netMinutes += net;
    perStaff.set(r.staff_id as string, cur);
  }

  const perDeptMinutes = new Map<string, number>();
  for (const a of perStaff.values()) {
    perDeptMinutes.set(a.department, (perDeptMinutes.get(a.department) ?? 0) + a.netMinutes);
  }

  const result = {
    range: { from, to },
    filter: { department: dept ?? null, location_id: locationId ?? null },
    netto_stunden: round1(totalNet / 60),
    brutto_stunden: round1(totalGross / 60),
    per_department: [...perDeptMinutes.entries()]
      .map(([d, m]) => ({ department: d, netto_stunden: round1(m / 60) }))
      .sort((a, b) => b.netto_stunden - a.netto_stunden),
    per_staff: [...perStaff.entries()]
      .map(([staffId, a]) => ({
        staff_id: staffId,
        name: a.displayName,
        department: a.department,
        netto_stunden: round1(a.netMinutes / 60),
      }))
      .sort((a, b) => b.netto_stunden - a.netto_stunden),
  };
  return pseudonymizeDeep(result, ctx.pseudonym);
}

async function abwesenheiten(ctx: ToolContext, input: Record<string, unknown>) {
  const { from, to } = requireRange(input.from, input.to);
  const typ = input.typ === "krank" || input.typ === "urlaub" ? input.typ : undefined;

  const { data: rows, error } = await ctx.admin
    .from("roster_absence")
    .select("staff_id, date, type, staff(display_name)")
    .eq("organization_id", ctx.organizationId)
    .gte("date", from)
    .lte("date", to);
  if (error) throw new Error(error.message);

  type Agg = { krankDays: number; urlaubDays: number; displayName: string };
  const perStaff = new Map<string, Agg>();
  let totalKrank = 0;
  let totalUrlaub = 0;
  for (const r of rows ?? []) {
    if (typ && r.type !== typ) continue;
    const staffId = r.staff_id as string;
    const cur = perStaff.get(staffId) ?? {
      krankDays: 0,
      urlaubDays: 0,
      displayName: (r.staff as { display_name: string } | null)?.display_name ?? staffId,
    };
    if (r.type === "krank") {
      cur.krankDays += 1;
      totalKrank += 1;
    } else if (r.type === "urlaub") {
      cur.urlaubDays += 1;
      totalUrlaub += 1;
    }
    perStaff.set(staffId, cur);
  }

  const result = {
    range: { from, to },
    filter_typ: typ ?? null,
    gesamt_krank_tage: totalKrank,
    gesamt_urlaub_tage: totalUrlaub,
    per_staff: [...perStaff.entries()]
      .map(([staffId, a]) => ({
        staff_id: staffId,
        name: a.displayName,
        krank_tage: a.krankDays,
        urlaub_tage: a.urlaubDays,
      }))
      .sort((a, b) => b.krank_tage + b.urlaub_tage - (a.krank_tage + a.urlaub_tage)),
  };
  return pseudonymizeDeep(result, ctx.pseudonym);
}

async function personalkostenQuote(ctx: ToolContext, input: Record<string, unknown>) {
  const { from, to } = requireRange(input.from, input.to);
  const locationId = optionalUuid(input.location_id, "location_id");

  let q = ctx.admin
    .from("time_entries")
    .select("staff_id, started_at, ended_at, break_minutes, business_date, location_id")
    .eq("organization_id", ctx.organizationId)
    .gte("business_date", from)
    .lte("business_date", to)
    .not("ended_at", "is", null);
  if (locationId) q = q.eq("location_id", locationId);
  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);

  const workEntries: WorkEntry[] = [];
  const staffIdSet = new Set<string>();
  for (const r of rows ?? []) {
    if (!r.ended_at || !r.started_at) continue;
    const gross = grossMinutesBetween(new Date(r.started_at), new Date(r.ended_at));
    const net = Math.max(0, gross - Number(r.break_minutes ?? 0));
    staffIdSet.add(r.staff_id as string);
    workEntries.push({
      staffId: r.staff_id as string,
      businessDate: r.business_date as string,
      netMinutes: net,
    });
  }

  const compByStaff: Record<string, CompRow[]> = {};
  if (staffIdSet.size > 0) {
    const { data: comp, error: compErr } = await ctx.admin
      .from("staff_compensation")
      .select("staff_id, valid_from, hourly_rate")
      .eq("organization_id", ctx.organizationId)
      .in("staff_id", [...staffIdSet]);
    if (compErr) throw new Error(compErr.message);
    for (const c of comp ?? []) {
      if (!c.staff_id || !c.valid_from || c.hourly_rate === null) continue;
      (compByStaff[c.staff_id as string] ??= []).push({
        validFrom: c.valid_from as string,
        hourlyRateEur: Number(c.hourly_rate),
      });
    }
  }
  const agg = aggregatePersonnel(workEntries, compByStaff);

  // Umsatz derselbe Ausschnitt.
  const umsatz = await umsatzZeitraum(ctx, { from, to, location_id: locationId ?? "" });
  const kostenEur = agg.totalLaborCostCents / 100;
  const umsatzEur = (umsatz as { umsatz_eur: number }).umsatz_eur;
  const quote = umsatzEur > 0 ? +(100 * (kostenEur / umsatzEur)).toFixed(1) : null;

  return {
    range: { from, to },
    location_id: locationId ?? null,
    personalkosten_eur: round2(kostenEur),
    netto_stunden: round1(agg.totalNetHours),
    mitarbeiter_ohne_lohnsatz: agg.staffWithoutRate.length,
    umsatz_eur: round2(umsatzEur),
    quote_pct: quote,
    hinweis:
      "Nur Brutto-Basis (Netto-Stunden × Stundensatz). AG-SV-Anteil und SFN-Zuschläge sind NICHT enthalten — Quote ist eine Näherung.",
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}