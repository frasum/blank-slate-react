// Server-Functions für Modul M-BWA (Welle F1).
//
// - `listBwaMonths`: read-only, admin, org-gescoped.
// - `upsertBwaMonth`: admin-only, Zod-validierter Input, Quersummen-Check via
//   validateBwaMonth (Ablehnung mit Fehlertext), Upsert auf Unique-Key,
//   organization_id IMMER aus Caller-Kontext. Audit `bwa.upsert` bei Erfolg.
// - `deleteBwaMonth`: admin-only, Audit `bwa.delete` mit vollem Snapshot.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { makeAuditWriter } from "@/lib/admin/audit";
import { deriveBwa, validateBwaMonth, type BwaMonthInput } from "./bwa-core";

const monthRegex = /^\d{4}-\d{2}-\d{2}$/;

const cents = z.number().int().finite();
const centsNonNeg = z.number().int().nonnegative().finite();

// `source` steuert, aus welcher Quelle der Monat kommt. "import" ist
// SQL-Importen vorbehalten und darf nicht vom Client gesetzt werden.
const sourceEnum = z.enum(["manual", "pdf"]).default("manual");

// Sachkosten-Detail (F3): flaches Objekt Kategorie -> Cent-Betrag (int).
const sachkostenDetailSchema = z.record(z.string().min(1).max(200), z.number().int().finite());

const upsertInput = z.object({
  id: z.string().uuid().optional(),
  entity: z.string().trim().min(1).max(120),
  costCenter: z.string().trim().min(1).max(120),
  month: z
    .string()
    .regex(monthRegex, "Datum im Format YYYY-MM-DD erwartet")
    .refine((s) => s.endsWith("-01"), "Monat muss der Monatserste sein (YYYY-MM-01)"),
  umsatzCents: cents,
  getraenkeCents: centsNonNeg,
  speisenHausCents: centsNonNeg,
  speisenAusserHausCents: centsNonNeg,
  sonstigeErloeseCents: centsNonNeg,
  sonstErtraegeCents: centsNonNeg,
  wareneinsatzCents: centsNonNeg,
  personalCents: centsNonNeg,
  sachkostenCents: centsNonNeg,
  anlageCents: cents,
  abschreibungCents: cents,
  betriebsergebnisCents: cents,
  source: sourceEnum,
  sachkostenDetail: sachkostenDetailSchema.optional(),
});

export type BwaRow = {
  id: string;
  entity: string;
  costCenter: string;
  month: string;
  umsatzCents: number;
  getraenkeCents: number;
  speisenHausCents: number;
  speisenAusserHausCents: number;
  sonstigeErloeseCents: number;
  sonstErtraegeCents: number;
  wareneinsatzCents: number;
  personalCents: number;
  sachkostenCents: number;
  anlageCents: number;
  abschreibungCents: number;
  betriebsergebnisCents: number;
  sachkostenDetail: Record<string, number> | null;
  source: "manual" | "pdf" | "import";
};

type DbRow = {
  id: string;
  entity: string;
  cost_center: string;
  month: string;
  umsatz_cents: number;
  getraenke_cents: number;
  speisen_haus_cents: number;
  speisen_ausser_haus_cents: number;
  sonstige_erloese_cents: number;
  sonst_ertraege_cents: number;
  wareneinsatz_cents: number;
  personal_cents: number;
  sachkosten_cents: number;
  anlage_cents: number;
  abschreibung_cents: number;
  betriebsergebnis_cents: number;
  sachkosten_detail: unknown;
  source: "manual" | "pdf" | "import";
};

function rowFromDb(r: DbRow): BwaRow {
  return {
    id: r.id,
    entity: r.entity,
    costCenter: r.cost_center,
    month: r.month,
    umsatzCents: Number(r.umsatz_cents),
    getraenkeCents: Number(r.getraenke_cents),
    speisenHausCents: Number(r.speisen_haus_cents),
    speisenAusserHausCents: Number(r.speisen_ausser_haus_cents),
    sonstigeErloeseCents: Number(r.sonstige_erloese_cents),
    sonstErtraegeCents: Number(r.sonst_ertraege_cents),
    wareneinsatzCents: Number(r.wareneinsatz_cents),
    personalCents: Number(r.personal_cents),
    sachkostenCents: Number(r.sachkosten_cents),
    anlageCents: Number(r.anlage_cents),
    abschreibungCents: Number(r.abschreibung_cents),
    betriebsergebnisCents: Number(r.betriebsergebnis_cents),
    sachkostenDetail:
      r.sachkosten_detail && typeof r.sachkosten_detail === "object"
        ? (r.sachkosten_detail as Record<string, number>)
        : null,
    source: r.source,
  };
}

const SELECT_COLS =
  "id, entity, cost_center, month, umsatz_cents, getraenke_cents, speisen_haus_cents, speisen_ausser_haus_cents, sonstige_erloese_cents, sonst_ertraege_cents, wareneinsatz_cents, personal_cents, sachkosten_cents, anlage_cents, abschreibung_cents, betriebsergebnis_cents, sachkosten_detail, source";

export const listBwaMonths = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ["admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("bwa_monthly")
      .select(SELECT_COLS)
      .eq("organization_id", caller.organizationId)
      .order("entity")
      .order("cost_center")
      .order("month", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => rowFromDb(r as unknown as DbRow));
  });

export const upsertBwaMonth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => upsertInput.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ["admin"]);

    const bwaInput: BwaMonthInput = {
      umsatzCents: data.umsatzCents,
      getraenkeCents: data.getraenkeCents,
      speisenHausCents: data.speisenHausCents,
      speisenAusserHausCents: data.speisenAusserHausCents,
      sonstigeErloeseCents: data.sonstigeErloeseCents,
      sonstErtraegeCents: data.sonstErtraegeCents,
      wareneinsatzCents: data.wareneinsatzCents,
      personalCents: data.personalCents,
      sachkostenCents: data.sachkostenCents,
      anlageCents: data.anlageCents,
      abschreibungCents: data.abschreibungCents,
      betriebsergebnisCents: data.betriebsergebnisCents,
    };
    const check = validateBwaMonth(bwaInput);
    if (!check.ok) {
      throw new Error(check.errors.join(" "));
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Bestehende Zeile ermitteln, um `source` bei Updates zu erhalten.
    const { data: existing, error: exErr } = await supabaseAdmin
      .from("bwa_monthly")
      .select("id, source")
      .eq("organization_id", caller.organizationId)
      .eq("entity", data.entity)
      .eq("cost_center", data.costCenter)
      .eq("month", data.month)
      .maybeSingle();
    if (exErr) throw exErr;

    const payload = {
      organization_id: caller.organizationId,
      entity: data.entity,
      cost_center: data.costCenter,
      month: data.month,
      umsatz_cents: data.umsatzCents,
      getraenke_cents: data.getraenkeCents,
      speisen_haus_cents: data.speisenHausCents,
      speisen_ausser_haus_cents: data.speisenAusserHausCents,
      sonstige_erloese_cents: data.sonstigeErloeseCents,
      sonst_ertraege_cents: data.sonstErtraegeCents,
      wareneinsatz_cents: data.wareneinsatzCents,
      personal_cents: data.personalCents,
      sachkosten_cents: data.sachkostenCents,
      anlage_cents: data.anlageCents,
      abschreibung_cents: data.abschreibungCents,
      betriebsergebnis_cents: data.betriebsergebnisCents,
      source: data.source,
      // F3: Detail nur setzen, wenn vom Aufrufer explizit übergeben —
      // der Erfassungs-Dialog schickt keins und soll bestehendes Detail
      // NICHT plätten (das wird durch das Weglassen erreicht).
      ...(data.sachkostenDetail !== undefined ? { sachkosten_detail: data.sachkostenDetail } : {}),
    } as Record<string, unknown>;

    const { data: saved, error: upErr } = await supabaseAdmin
      .from("bwa_monthly")
      .upsert(payload as never, {
        onConflict: "organization_id,entity,cost_center,month",
      })
      .select(SELECT_COLS)
      .single();
    if (upErr) throw upErr;
    const row = rowFromDb(saved as unknown as DbRow);

    await makeAuditWriter(caller)({
      action: "bwa.upsert",
      entity: "bwa_monthly",
      entityId: row.id,
      meta: {
        entity: row.entity,
        cost_center: row.costCenter,
        month: row.month,
        betriebsergebnis_cents: row.betriebsergebnisCents,
        was_update: !!existing,
        source: data.source,
        prev_source: existing?.source ?? null,
        with_detail: data.sachkostenDetail !== undefined,
      },
    });

    return { row, derived: deriveBwa(bwaInput) };
  });

export const deleteBwaMonth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ["admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: snap, error: snapErr } = await supabaseAdmin
      .from("bwa_monthly")
      .select("*")
      .eq("id", data.id)
      .eq("organization_id", caller.organizationId)
      .maybeSingle();
    if (snapErr) throw snapErr;
    if (!snap) throw new Error("BWA-Zeile nicht gefunden.");

    const { error: delErr } = await supabaseAdmin
      .from("bwa_monthly")
      .delete()
      .eq("id", data.id)
      .eq("organization_id", caller.organizationId);
    if (delErr) throw delErr;

    await makeAuditWriter(caller)({
      action: "bwa.delete",
      entity: "bwa_monthly",
      entityId: data.id,
      meta: { snapshot: snap as Record<string, unknown> },
    });

    return { ok: true as const };
  });
