// Server-Functions fuer den Jahresabschluss (Welle F4a).
//
// Muster: bwa.functions.ts (Admin-Gate via loadAdminCaller, Zod-Validierung,
// org-Scope aus Caller-Kontext, Audit nur bei Erfolg). Schreiben laeuft
// ausschliesslich ueber die RPC replace_bilanz_year (delete + bulk-insert
// in EINER Transaktion; siehe docs/bilanz-schema-draft.sql — Migration
// legt Frank selbst an).
//
// Hinweis zu den Typen: Die Datenbank-Typen (integrations/supabase/types.ts)
// enthalten die neuen Tabellen erst, nachdem Frank die Migration ausgefuehrt
// und `supabase gen types` neu erzeugt hat. Bis dahin wird der Admin-Client
// lokal auf eine minimale Bilanz-DB-Signatur gecastet — Ehrlichkeitsregel:
// hier nur DAS zusaetzlich typisieren, was diese Datei anfasst, damit
// TypeScript nicht die generierten Typen ueberschreibt.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { makeAuditWriter } from "@/lib/admin/audit";

// ---------------------------------------------------------------------------
// Zod-Schemata
// ---------------------------------------------------------------------------

const statementEnum = z.enum(["aktiva", "passiva", "guv"]);

const cents = z.number().int().finite();
const centsNullable = z.number().int().finite().nullable();

const positionSchema = z.object({
  statement: statementEnum,
  code: z.string().trim().min(1).max(60),
  parentCode: z.string().trim().min(1).max(60).nullable(),
  label: z.string().trim().min(1).max(300),
  level: z.number().int().min(0).max(3),
  sortOrder: z.number().int().nonnegative(),
  betragCents: cents,
  vorjahrCents: centsNullable,
  source: z.enum(["pdf", "manual"]).default("pdf"),
});

const kontoSchema = z.object({
  statement: statementEnum,
  positionCode: z.string().trim().min(1).max(60),
  kontoNr: z.string().trim().min(1).max(20),
  label: z.string().trim().min(1).max(300),
  betragCents: cents,
  vorjahrCents: centsNullable,
  sortOrder: z.number().int().nonnegative(),
});

export const replaceBilanzYearInput = z.object({
  entity: z.string().trim().min(1).max(200),
  fiscalYear: z.number().int().min(2000).max(2100),
  positions: z.array(positionSchema).min(1),
  konten: z.array(kontoSchema),
});

export type ReplaceBilanzPayload = z.infer<typeof replaceBilanzYearInput>;

// ---------------------------------------------------------------------------
// Serverseitige Re-Validierung der Gates (dem Client nicht vertrauen)
// ---------------------------------------------------------------------------

export function validateReplacePayload(
  payload: ReplaceBilanzPayload,
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const codesByStmt = new Map<string, Set<string>>();
  for (const p of payload.positions) {
    const s = codesByStmt.get(p.statement) ?? new Set<string>();
    s.add(p.code);
    codesByStmt.set(p.statement, s);
  }

  const isLeaf = (stmt: string, code: string): boolean => {
    const codes = codesByStmt.get(stmt);
    if (!codes) return true;
    for (const c of codes) {
      if (c !== code && c.startsWith(code + ".")) return false;
    }
    return true;
  };

  // Gate 1: Σ Konten je Blatt-Position = Positionsbetrag.
  for (const p of payload.positions) {
    if (!isLeaf(p.statement, p.code)) continue;
    const rel = payload.konten.filter((k) => k.statement === p.statement && k.positionCode === p.code);
    if (rel.length === 0) continue;
    const sum = rel.reduce((a, k) => a + k.betragCents, 0);
    if (sum !== p.betragCents) {
      errors.push(
        `Konten-Summe fuer ${p.statement}:${p.code} = ${sum} ≠ Position ${p.betragCents}.`,
      );
    }
  }

  // Gate 2: Σ Top-Level Aktiva = Σ Top-Level Passiva.
  const topSum = (stmt: string) =>
    payload.positions.filter((p) => p.statement === stmt && p.level === 0).reduce((a, p) => a + p.betragCents, 0);
  const aktiva = topSum("aktiva");
  const passiva = topSum("passiva");
  if ((aktiva || passiva) && aktiva !== passiva) {
    errors.push(`Bilanzsumme Aktiva (${aktiva}) ≠ Passiva (${passiva}).`);
  }

  // Gate 3: GuV-Staffel — Σ(erste N-1 Top-Level) = letzter Top-Level.
  const guv = payload.positions.filter((p) => p.statement === "guv" && p.level === 0);
  if (guv.length >= 2) {
    const last = guv[guv.length - 1];
    const sumWoLast = guv.slice(0, -1).reduce((a, p) => a + p.betragCents, 0);
    if (sumWoLast !== last.betragCents) {
      errors.push(
        `GuV-Staffel: Σ(erste ${guv.length - 1}) = ${sumWoLast} ≠ letzter Posten ${last.betragCents}.`,
      );
    }
  }

  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Lokale DB-Signatur (siehe Kommentar oben)
// ---------------------------------------------------------------------------

type BilanzPositionRow = {
  id: string;
  organization_id: string;
  entity: string;
  fiscal_year: number;
  statement: "aktiva" | "passiva" | "guv";
  code: string;
  parent_code: string | null;
  label: string;
  level: number;
  sort_order: number;
  betrag_cents: number;
  vorjahr_cents: number | null;
  source: "pdf" | "manual";
};

type BilanzKontoRow = {
  id: string;
  organization_id: string;
  entity: string;
  fiscal_year: number;
  statement: "aktiva" | "passiva" | "guv";
  position_code: string;
  konto_nr: string;
  label: string;
  betrag_cents: number;
  vorjahr_cents: number | null;
  sort_order: number;
};

type BilanzDb = {
  public: {
    Tables: {
      bilanz_positions: {
        Row: BilanzPositionRow;
        Insert: Omit<BilanzPositionRow, "id">;
        Update: Partial<BilanzPositionRow>;
        Relationships: [];
      };
      bilanz_konten: {
        Row: BilanzKontoRow;
        Insert: Omit<BilanzKontoRow, "id">;
        Update: Partial<BilanzKontoRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      replace_bilanz_year: {
        Args: {
          p_organization_id: string;
          p_entity: string;
          p_fiscal_year: number;
          p_positions: unknown;
          p_konten: unknown;
        };
        Returns: void;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

async function bilanzDb(): Promise<SupabaseClient<BilanzDb>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient<BilanzDb>;
}

// ---------------------------------------------------------------------------
// listBilanzYears
// ---------------------------------------------------------------------------

export const listBilanzYears = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ["admin"]);
    const db = await bilanzDb();
    const { data, error } = await db
      .from("bilanz_positions")
      .select("entity, fiscal_year")
      .eq("organization_id", caller.organizationId);
    if (error) throw error;
    const seen = new Map<string, { entity: string; fiscalYear: number }>();
    for (const r of data ?? []) {
      const k = `${r.entity}::${r.fiscal_year}`;
      if (!seen.has(k)) seen.set(k, { entity: r.entity, fiscalYear: r.fiscal_year });
    }
    return Array.from(seen.values()).sort(
      (a, b) => a.entity.localeCompare(b.entity) || b.fiscalYear - a.fiscalYear,
    );
  });

// ---------------------------------------------------------------------------
// getBilanzYear
// ---------------------------------------------------------------------------

const yearKey = z.object({
  entity: z.string().trim().min(1).max(200),
  fiscalYear: z.number().int().min(2000).max(2100),
});

export const getBilanzYear = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => yearKey.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ["admin"]);
    const db = await bilanzDb();

    const posQ = await db
      .from("bilanz_positions")
      .select("*")
      .eq("organization_id", caller.organizationId)
      .eq("entity", data.entity)
      .eq("fiscal_year", data.fiscalYear)
      .order("sort_order", { ascending: true });
    if (posQ.error) throw posQ.error;

    const kontenQ = await db
      .from("bilanz_konten")
      .select("*")
      .eq("organization_id", caller.organizationId)
      .eq("entity", data.entity)
      .eq("fiscal_year", data.fiscalYear)
      .order("sort_order", { ascending: true });
    if (kontenQ.error) throw kontenQ.error;

    return { positions: posQ.data ?? [], konten: kontenQ.data ?? [] };
  });

// ---------------------------------------------------------------------------
// replaceBilanzYear
// ---------------------------------------------------------------------------

export const replaceBilanzYear = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => replaceBilanzYearInput.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ["admin"]);

    const check = validateReplacePayload(data);
    if (!check.ok) {
      throw new Error(`Konsistenz-Gate fehlgeschlagen: ${check.errors.join(" ")}`);
    }

    const db = await bilanzDb();
    const { error } = await db.rpc("replace_bilanz_year", {
      p_organization_id: caller.organizationId,
      p_entity: data.entity,
      p_fiscal_year: data.fiscalYear,
      p_positions: data.positions.map((p) => ({
        statement: p.statement,
        code: p.code,
        parent_code: p.parentCode,
        label: p.label,
        level: p.level,
        sort_order: p.sortOrder,
        betrag_cents: p.betragCents,
        vorjahr_cents: p.vorjahrCents,
        source: p.source,
      })),
      p_konten: data.konten.map((k) => ({
        statement: k.statement,
        position_code: k.positionCode,
        konto_nr: k.kontoNr,
        label: k.label,
        betrag_cents: k.betragCents,
        vorjahr_cents: k.vorjahrCents,
        sort_order: k.sortOrder,
      })),
    });
    if (error) throw error;

    const bilanzsumme = data.positions
      .filter((p) => p.statement === "aktiva" && p.level === 0)
      .reduce((a, p) => a + p.betragCents, 0);

    await makeAuditWriter(caller)({
      action: "bilanz.year_replaced",
      entity: "bilanz_positions",
      meta: {
        entity: data.entity,
        fiscal_year: data.fiscalYear,
        position_count: data.positions.length,
        konten_count: data.konten.length,
        bilanzsumme_cents: bilanzsumme,
      },
    });

    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// deleteBilanzYear
// ---------------------------------------------------------------------------

export const deleteBilanzYear = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => yearKey.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ["admin"]);
    const db = await bilanzDb();

    const del1 = await db
      .from("bilanz_konten")
      .delete()
      .eq("organization_id", caller.organizationId)
      .eq("entity", data.entity)
      .eq("fiscal_year", data.fiscalYear);
    if (del1.error) throw del1.error;

    const del2 = await db
      .from("bilanz_positions")
      .delete()
      .eq("organization_id", caller.organizationId)
      .eq("entity", data.entity)
      .eq("fiscal_year", data.fiscalYear);
    if (del2.error) throw del2.error;

    await makeAuditWriter(caller)({
      action: "bilanz.year_deleted",
      entity: "bilanz_positions",
      meta: { entity: data.entity, fiscal_year: data.fiscalYear },
    });

    return { ok: true as const };
  });