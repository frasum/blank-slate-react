// Server-Functions für Modul BK1 „Bankkonto".
// Muster: bwa.functions.ts (admin-only, org-gescoped, Zod-validiert,
// makeAuditWriter für Schreibpfade, supabaseAdmin lazy).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { makeAuditWriter } from "@/lib/admin/audit";
import {
  resolveCategory,
  sortRules,
  type CategoryRuleLite,
  type ResolveResult,
} from "./bank-categorize";
import { buildBankStats, type BankStats, type StatsTx } from "./bank-stats-core";
import { chunk } from "./bank-import-helpers";
import { computeDateFrom } from "./date-from";
import {
  findCrossAccountMatches,
  summarizeCrossAccountHits,
  type CandidateRow,
  type CrossAccountSummary,
  type ExistingRow,
} from "./cross-account-duplicates";
import { mapGcTransactionsResponse } from "./gocardless-map";
import { selectAllPaged } from "@/lib/supabase/select-all";

// ==== Typen für die UI ================================================

export type BankAccountRow = {
  id: string;
  iban: string;
  name: string;
  locationId: string | null;
};

export type BankCategoryRow = {
  id: string;
  name: string;
  sortOrder: number;
};

export type BankRuleRow = {
  id: string;
  categoryId: string;
  matchField: "name" | "zweck";
  pattern: string;
  priority: number;
};

export type BankTxRow = {
  id: string;
  accountId: string;
  laufendeNummer: number;
  buchungstag: string;
  wertstellungstag: string | null;
  betragCents: number;
  saldoCents: number | null;
  gegenpartei: string;
  verwendungszweck: string;
  bankKategorie: string;
  bankUnterkategorie: string;
  overrideCategoryId: string | null;
  resolvedCategoryId: string | null;
  resolvedSource: ResolveResult["source"];
};

// ==== Filter-Schema ===================================================

const filterSchema = z.object({
  accountId: z.string().uuid().nullable().optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

type Filter = z.infer<typeof filterSchema>;

// ==== Hilfen ==========================================================

async function loadAccountsForOrg(orgId: string): Promise<BankAccountRow[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("bank_accounts")
    .select("id, iban, name, location_id")
    .eq("organization_id", orgId)
    .order("name");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    iban: r.iban,
    name: r.name,
    locationId: r.location_id,
  }));
}

async function loadCategoriesAndRules(
  orgId: string,
): Promise<{ categories: BankCategoryRow[]; rules: CategoryRuleLite[] }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [catsRes, rulesRes] = await Promise.all([
    supabaseAdmin
      .from("bank_categories")
      .select("id, name, sort_order")
      .eq("organization_id", orgId)
      .order("sort_order")
      .order("name"),
    supabaseAdmin
      .from("bank_category_rules")
      .select("id, category_id, match_field, pattern, priority")
      .eq("organization_id", orgId)
      .order("priority")
      .order("pattern"),
  ]);
  if (catsRes.error) throw catsRes.error;
  if (rulesRes.error) throw rulesRes.error;
  const categories: BankCategoryRow[] = (catsRes.data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    sortOrder: r.sort_order,
  }));
  const rules: CategoryRuleLite[] = (rulesRes.data ?? []).map((r) => ({
    id: r.id,
    categoryId: r.category_id,
    matchField: r.match_field as "name" | "zweck",
    pattern: r.pattern,
    priority: r.priority,
  }));
  return { categories, rules };
}

function applyFilterToQuery(
  q: ReturnType<
    Awaited<
      ReturnType<(typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"]["from"]>
    >["select"]
  >,
  filter: Filter,
) {
  let out = q;
  if (filter.accountId) out = out.eq("account_id", filter.accountId);
  if (filter.from) out = out.gte("buchungstag", filter.from);
  if (filter.to) out = out.lte("buchungstag", filter.to);
  return out;
}

// ==== Server-Fns ======================================================

export const listBankAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ["admin"]);
    return loadAccountsForOrg(caller.organizationId);
  });

export const listBankCategoriesAndRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ["admin"]);
    const cats = await loadCategoriesAndRules(caller.organizationId);
    // Aktuelle Trefferzähler je Regel — an dieser Stelle laden wir NUR die
    // eindeutigen Buchungen der Org (ohne Override) und rechnen.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // BFIX3: PostgREST kappt bei 1000 Zeilen — paginieren, sonst zählt die
    // Regel-Trefferliste ab der ersten Seite still falsch.
    const txs = await selectAllPaged<{
      gegenpartei: string | null;
      verwendungszweck: string | null;
      override_category_id: string | null;
      id: string;
    }>((from, to) =>
      supabaseAdmin
        .from("bank_transactions")
        .select("id, gegenpartei, verwendungszweck, override_category_id")
        .eq("organization_id", caller.organizationId)
        .order("id", { ascending: true })
        .range(from, to),
    );
    const sortedRules = sortRules(cats.rules);
    const ruleHits: Record<string, number> = {};
    for (const r of sortedRules) ruleHits[r.id] = 0;
    for (const t of txs) {
      if (t.override_category_id) continue;
      const res = resolveCategory(
        {
          gegenpartei: t.gegenpartei ?? "",
          verwendungszweck: t.verwendungszweck ?? "",
          overrideCategoryId: null,
        },
        sortedRules,
      );
      if (res.source === "rule" && res.ruleId)
        ruleHits[res.ruleId] = (ruleHits[res.ruleId] ?? 0) + 1;
    }
    return { ...cats, ruleHits };
  });

// Import: verlangt geparste Zeilen — der CSV-Parser läuft im Browser, hier
// kommen nur validierte Objekte an. Konto wird bei Bedarf angelegt.
const importRowSchema = z.object({
  iban: z.string().trim().max(34),
  laufendeNummer: z.number().int(),
  buchungstag: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  wertstellungstag: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  betragCents: z.number().int(),
  saldoCents: z.number().int().nullable(),
  gegenpartei: z.string().max(500),
  verwendungszweck: z.string().max(2000),
  bankKategorie: z.string().max(200),
  bankUnterkategorie: z.string().max(200),
});

const importInput = z.object({
  accountIban: z
    .string()
    .trim()
    .regex(/^[A-Z]{2}\d{2}[A-Z0-9]+$/, "IBAN unplausibel")
    .max(34),
  accountName: z.string().trim().min(1).max(200).optional(),
  rows: z.array(importRowSchema).max(50_000),
});

export const importBankTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => importInput.parse(i))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ["admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Sicherheitsnetz: alle Zeilen müssen zur übergebenen accountIban gehören.
    // Der Client sollte das bereits garantieren, aber der Server ist die
    // maßgebliche Grenze — mehr-IBAN-Files dürfen nie in ein Konto laufen.
    const wantIban = data.accountIban;
    for (const r of data.rows) {
      const rowIban = r.iban.replace(/\s+/g, "");
      if (rowIban && rowIban !== wantIban) {
        throw new Error(
          `IBAN-Konflikt: Zeile enthält ${rowIban}, erwartet ${wantIban}. Datei enthält offenbar mehrere Konten.`,
        );
      }
    }
    // Konto suchen oder anlegen (Name aus IBAN ableiten, wenn nicht angegeben).
    const { data: acct, error: acctErr } = await supabaseAdmin
      .from("bank_accounts")
      .select("id")
      .eq("organization_id", caller.organizationId)
      .eq("iban", data.accountIban)
      .maybeSingle();
    if (acctErr) throw acctErr;
    let accountId: string;
    if (acct?.id) {
      accountId = acct.id;
    } else {
      const name = data.accountName ?? `Konto ${data.accountIban.slice(-4)}`;
      const ins = await supabaseAdmin
        .from("bank_accounts")
        .insert({ organization_id: caller.organizationId, iban: data.accountIban, name })
        .select("id")
        .single();
      if (ins.error) throw ins.error;
      accountId = ins.data.id;
    }
    // Vor-Upsert-Zählung, um "inserted" vs. "skippedExisting" zu ermitteln.
    const lfdNumbers = data.rows.map((r) => r.laufendeNummer);
    let existingCount = 0;
    if (lfdNumbers.length > 0) {
      // In Blöcken abfragen — PostgREST-`in()` erzeugt sonst bei sehr großen
      // CSVs URLs jenseits der Server-Limits.
      for (const part of chunk(lfdNumbers, 500)) {
        const { data: ex, error: exErr } = await supabaseAdmin
          .from("bank_transactions")
          .select("laufende_nummer")
          .eq("account_id", accountId)
          .in("laufende_nummer", part);
        if (exErr) throw exErr;
        existingCount += ex?.length ?? 0;
      }
    }
    if (data.rows.length > 0) {
      const payload = data.rows.map((r) => ({
        organization_id: caller.organizationId,
        account_id: accountId,
        laufende_nummer: r.laufendeNummer,
        buchungstag: r.buchungstag,
        wertstellungstag: r.wertstellungstag,
        betrag_cents: r.betragCents,
        saldo_cents: r.saldoCents,
        gegenpartei: r.gegenpartei,
        verwendungszweck: r.verwendungszweck,
        bank_kategorie: r.bankKategorie,
        bank_unterkategorie: r.bankUnterkategorie,
      }));
      // ignoreDuplicates: erneuter/überlappender Upload ist idempotent.
      const up = await supabaseAdmin.from("bank_transactions").upsert(payload as never, {
        onConflict: "account_id,laufende_nummer",
        ignoreDuplicates: true,
      });
      if (up.error) throw up.error;
    }
    const inserted = data.rows.length - existingCount;
    await makeAuditWriter(caller)({
      action: "bank.import",
      entity: "bank_transactions",
      entityId: accountId,
      meta: {
        iban: data.accountIban,
        rows: data.rows.length,
        inserted,
        skipped_existing: existingCount,
      },
    });
    return { accountId, inserted, skippedExisting: existingCount };
  });

export const listBankTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    filterSchema
      .extend({
        categoryId: z
          .union([z.string().uuid(), z.literal("_none")])
          .nullable()
          .optional(),
        search: z.string().trim().max(200).optional(),
        limit: z.number().int().min(1).max(2000).default(500),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ["admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Wenn nach Kategorie gefiltert wird, geschieht das erst nach dem
    // Auflösen im Node-Prozess (Regeln + Overrides). PostgREST kappt bei
    // 1000 Zeilen; ein reines `.limit(5000)` bringt daher nichts. Wir
    // paginieren stattdessen und schneiden nach dem Filtern auf data.limit.
    type TxRow = {
      id: string;
      account_id: string;
      laufende_nummer: number;
      buchungstag: string;
      wertstellungstag: string | null;
      betrag_cents: number;
      saldo_cents: number | null;
      gegenpartei: string | null;
      verwendungszweck: string | null;
      bank_kategorie: string | null;
      bank_unterkategorie: string | null;
      override_category_id: string | null;
    };
    const like =
      data.search && data.search.length > 0
        ? `%${data.search.replace(/[%_]/g, (m) => `\\${m}`)}%`
        : null;
    const txs = await selectAllPaged<Omit<TxRow, "laufende_nummer"> & { laufende_nummer: number | null }>((from, to) => {
      let q = supabaseAdmin
        .from("bank_transactions")
        .select(
          "id, account_id, laufende_nummer, buchungstag, wertstellungstag, betrag_cents, saldo_cents, gegenpartei, verwendungszweck, bank_kategorie, bank_unterkategorie, override_category_id",
        )
        .eq("organization_id", caller.organizationId)
        .order("buchungstag", { ascending: false })
        .order("laufende_nummer", { ascending: false })
        .order("id", { ascending: false });
      q = applyFilterToQuery(q, data) as typeof q;
      if (like) q = q.or(`gegenpartei.ilike.${like},verwendungszweck.ilike.${like}`);
      return q.range(from, to);
    });
    const { rules } = await loadCategoriesAndRules(caller.organizationId);
    const sortedRules = sortRules(rules);
    const out: BankTxRow[] = [];
    for (const t of txs) {
      const res = resolveCategory(
        {
          gegenpartei: t.gegenpartei ?? "",
          verwendungszweck: t.verwendungszweck ?? "",
          overrideCategoryId: t.override_category_id,
        },
        sortedRules,
      );
      if (data.categoryId === "_none") {
        if (res.categoryId != null) continue;
      } else if (data.categoryId) {
        if (res.categoryId !== data.categoryId) continue;
      }
      out.push({
        id: t.id,
        accountId: t.account_id,
        laufendeNummer: Number(t.laufende_nummer),
        buchungstag: t.buchungstag,
        wertstellungstag: t.wertstellungstag,
        betragCents: Number(t.betrag_cents),
        saldoCents: t.saldo_cents == null ? null : Number(t.saldo_cents),
        gegenpartei: t.gegenpartei ?? "",
        verwendungszweck: t.verwendungszweck ?? "",
        bankKategorie: t.bank_kategorie ?? "",
        bankUnterkategorie: t.bank_unterkategorie ?? "",
        overrideCategoryId: t.override_category_id,
        resolvedCategoryId: res.categoryId,
        resolvedSource: res.source,
      });
      if (out.length >= data.limit) break;
    }
    return out;
  });

export const getBankStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => filterSchema.parse(i))
  .handler(async ({ data, context }): Promise<BankStats> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ["admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("bank_transactions")
      .select(
        "buchungstag, betrag_cents, saldo_cents, gegenpartei, verwendungszweck, override_category_id",
      )
      .eq("organization_id", caller.organizationId)
      .order("buchungstag", { ascending: true })
      .order("laufende_nummer", { ascending: true })
      .limit(50_000);
    q = applyFilterToQuery(q, data) as typeof q;
    const { data: txs, error } = await q;
    if (error) throw error;
    const { categories, rules } = await loadCategoriesAndRules(caller.organizationId);
    const sortedRules = sortRules(rules);
    const catMap = new Map(categories.map((c) => [c.id, c.name] as const));
    const stats: StatsTx[] = (txs ?? []).map((t) => {
      const res = resolveCategory(
        {
          gegenpartei: t.gegenpartei ?? "",
          verwendungszweck: t.verwendungszweck ?? "",
          overrideCategoryId: t.override_category_id,
        },
        sortedRules,
      );
      return {
        buchungstag: t.buchungstag,
        betragCents: Number(t.betrag_cents),
        saldoCents: t.saldo_cents == null ? null : Number(t.saldo_cents),
        gegenpartei: t.gegenpartei ?? "",
        categoryId: res.categoryId,
      };
    });
    return buildBankStats(stats, catMap);
  });

export const setBankTransactionCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        transactionId: z.string().uuid(),
        categoryId: z.string().uuid().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ["admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Zugehörigkeit prüfen (Org-Scope).
    const { data: tx, error: txErr } = await supabaseAdmin
      .from("bank_transactions")
      .select("id, organization_id")
      .eq("id", data.transactionId)
      .maybeSingle();
    if (txErr) throw txErr;
    if (!tx || tx.organization_id !== caller.organizationId) {
      throw new Error("Buchung nicht gefunden.");
    }
    if (data.categoryId) {
      const { data: cat, error: catErr } = await supabaseAdmin
        .from("bank_categories")
        .select("id, organization_id")
        .eq("id", data.categoryId)
        .maybeSingle();
      if (catErr) throw catErr;
      if (!cat || cat.organization_id !== caller.organizationId) {
        throw new Error("Kategorie nicht gefunden.");
      }
    }
    const { error } = await supabaseAdmin
      .from("bank_transactions")
      .update({ override_category_id: data.categoryId })
      .eq("id", data.transactionId);
    if (error) throw error;
    await makeAuditWriter(caller)({
      action: data.categoryId ? "bank.tx.override_set" : "bank.tx.override_clear",
      entity: "bank_transactions",
      entityId: data.transactionId,
      meta: { category_id: data.categoryId },
    });
    return { ok: true as const };
  });

export const createBankCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({ name: z.string().trim().min(1).max(120), sortOrder: z.number().int().default(0) })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ["admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("bank_categories")
      .insert({
        organization_id: caller.organizationId,
        name: data.name,
        sort_order: data.sortOrder,
      })
      .select("id, name, sort_order")
      .single();
    if (error) throw error;
    await makeAuditWriter(caller)({
      action: "bank.category.create",
      entity: "bank_categories",
      entityId: row.id,
      meta: { name: row.name },
    });
    return { id: row.id, name: row.name, sortOrder: row.sort_order } satisfies BankCategoryRow;
  });

export const renameBankCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(120) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ["admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("bank_categories")
      .update({ name: data.name })
      .eq("id", data.id)
      .eq("organization_id", caller.organizationId)
      .select("id, name")
      .single();
    if (error) throw error;
    await makeAuditWriter(caller)({
      action: "bank.category.rename",
      entity: "bank_categories",
      entityId: row.id,
      meta: { name: row.name },
    });
    return { ok: true as const };
  });

export const deleteBankCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ["admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Explizite Nutzungsprüfung: weder Overrides noch Regeln dürfen die
    // Kategorie referenzieren. NICHT auf ON DELETE CASCADE der Regeln
    // verlassen — das würde Regeln stillschweigend mitlöschen.
    const [ovRes, ruleRes] = await Promise.all([
      supabaseAdmin
        .from("bank_transactions")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", caller.organizationId)
        .eq("override_category_id", data.id),
      supabaseAdmin
        .from("bank_category_rules")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", caller.organizationId)
        .eq("category_id", data.id),
    ]);
    if (ovRes.error) throw ovRes.error;
    if (ruleRes.error) throw ruleRes.error;
    const overrides = ovRes.count ?? 0;
    const rules = ruleRes.count ?? 0;
    if (overrides > 0 || rules > 0) {
      throw new Error(
        `Kategorie noch in Verwendung: ${overrides} manuelle Zuordnung(en), ${rules} Regel(n). Bitte zuerst Overrides zurücksetzen und Regeln löschen.`,
      );
    }
    const { error } = await supabaseAdmin
      .from("bank_categories")
      .delete()
      .eq("id", data.id)
      .eq("organization_id", caller.organizationId);
    if (error) throw error;
    await makeAuditWriter(caller)({
      action: "bank.category.delete",
      entity: "bank_categories",
      entityId: data.id,
    });
    return { ok: true as const };
  });

export const createBankCategoryRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        categoryId: z.string().uuid(),
        matchField: z.enum(["name", "zweck"]),
        pattern: z.string().trim().min(1).max(200),
        priority: z.number().int().default(100),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ["admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Kategorie muss zur Org gehören.
    const { data: cat, error: catErr } = await supabaseAdmin
      .from("bank_categories")
      .select("organization_id")
      .eq("id", data.categoryId)
      .maybeSingle();
    if (catErr) throw catErr;
    if (!cat || cat.organization_id !== caller.organizationId) {
      throw new Error("Kategorie nicht gefunden.");
    }
    const { data: row, error } = await supabaseAdmin
      .from("bank_category_rules")
      .insert({
        organization_id: caller.organizationId,
        category_id: data.categoryId,
        match_field: data.matchField,
        pattern: data.pattern,
        priority: data.priority,
      })
      .select("id")
      .single();
    if (error) throw error;
    await makeAuditWriter(caller)({
      action: "bank.rule.create",
      entity: "bank_category_rules",
      entityId: row.id,
      meta: { category_id: data.categoryId, match_field: data.matchField, pattern: data.pattern },
    });
    return { ok: true as const, id: row.id };
  });

export const deleteBankCategoryRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ["admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("bank_category_rules")
      .delete()
      .eq("id", data.id)
      .eq("organization_id", caller.organizationId);
    if (error) throw error;
    await makeAuditWriter(caller)({
      action: "bank.rule.delete",
      entity: "bank_category_rules",
      entityId: data.id,
    });
    return { ok: true as const };
  });

// ============================================================ BK2
// GoCardless-Anbindung, Cross-Account-Duplikatswarnung, IBAN-Match.

function normalizeIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}

export type BankAccountConnectionState = {
  accountId: string;
  hasConnection: boolean;
  gocardlessAccountId: string | null;
  agreementExpiresAt: string | null;
  lastSyncBookingDate: string | null;
};

export const getBankAccountConnectionState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ accountId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<BankAccountConnectionState> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ["admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: acct, error } = await supabaseAdmin
      .from("bank_accounts")
      .select("id, gocardless_account_id, gocardless_agreement_expires_at, organization_id")
      .eq("id", data.accountId)
      .maybeSingle();
    if (error) throw error;
    if (!acct || acct.organization_id !== caller.organizationId) {
      throw new Error("Konto nicht gefunden.");
    }
    let lastSync: string | null = null;
    if (acct.gocardless_account_id) {
      const { data: tx, error: txErr } = await supabaseAdmin
        .from("bank_transactions")
        .select("buchungstag")
        .eq("organization_id", caller.organizationId)
        .eq("account_id", data.accountId)
        .not("external_tx_id", "is", null)
        .order("buchungstag", { ascending: false })
        .limit(1);
      if (txErr) throw txErr;
      lastSync = tx?.[0]?.buchungstag ?? null;
    }
    return {
      accountId: acct.id,
      hasConnection: !!acct.gocardless_account_id,
      gocardlessAccountId: acct.gocardless_account_id ?? null,
      agreementExpiresAt: acct.gocardless_agreement_expires_at ?? null,
      lastSyncBookingDate: lastSync,
    };
  });

/** Startet den Consent-Flow. `redirectUrl` liefert die UI (window.location.origin + Callback-Pfad). */
export const startBankConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        accountId: z.string().uuid(),
        institutionId: z.string().min(1).max(200).default("DEUTSCHE_BANK_DEUTDEDBXXX"),
        redirectUrl: z.string().url(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ["admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Konto zur Org sicherstellen.
    const { data: acct, error: acctErr } = await supabaseAdmin
      .from("bank_accounts")
      .select("id, organization_id")
      .eq("id", data.accountId)
      .maybeSingle();
    if (acctErr) throw acctErr;
    if (!acct || acct.organization_id !== caller.organizationId) {
      throw new Error("Konto nicht gefunden.");
    }
    const gc = await import("./gocardless.server");
    const agreement = await gc.createAgreement(data.institutionId);
    const req = await gc.createRequisition({
      institutionId: data.institutionId,
      agreementId: agreement.id,
      redirectUrl: data.redirectUrl,
      reference: `bk2-${data.accountId}-${Date.now()}`,
    });
    // Requisition am Konto vormerken (Institut + Requisition + Ablauf). Account-ID
    // gibt es erst nach Consent — in finalizeBankConnect.
    const expiresAt = new Date(
      Date.now() + (agreement.access_valid_for_days ?? 90) * 24 * 3600 * 1000,
    ).toISOString();
    const { error: updErr } = await supabaseAdmin
      .from("bank_accounts")
      .update({
        gocardless_institution_id: data.institutionId,
        gocardless_requisition_id: req.id,
        gocardless_agreement_expires_at: expiresAt,
      })
      .eq("id", data.accountId);
    if (updErr) throw updErr;
    await makeAuditWriter(caller)({
      action: "bank.connect.start",
      entity: "bank_accounts",
      entityId: data.accountId,
      meta: { institution_id: data.institutionId, requisition_id: req.id },
    });
    return { redirectUrl: req.link, requisitionId: req.id };
  });

/** Nach Consent-Rückkehr: verknüpft gocardless_account_id STRIKT per IBAN. */
export const finalizeBankConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ requisitionId: z.string().min(1).max(200) }).parse(i))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ["admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Konto anhand der Requisition finden — muss zur Org gehören.
    const { data: acct, error: acctErr } = await supabaseAdmin
      .from("bank_accounts")
      .select("id, iban, name, organization_id, gocardless_institution_id")
      .eq("gocardless_requisition_id", data.requisitionId)
      .maybeSingle();
    if (acctErr) throw acctErr;
    if (!acct || acct.organization_id !== caller.organizationId) {
      throw new Error("Konto zu dieser Requisition nicht gefunden.");
    }
    const gc = await import("./gocardless.server");
    const req = await gc.getRequisition(data.requisitionId);
    if (!req.accounts || req.accounts.length === 0) {
      throw new Error(`Kein Konto vom Institut freigegeben (Status: ${req.status}).`);
    }
    // Für jedes GC-Konto Details laden und per IBAN-Match zuordnen.
    // Strikte Regel: Verknüpfung passiert NUR bei exaktem IBAN-Match auf
    // ein bank_accounts.iban der Org — kein Dropdown, keine Heuristik.
    const expectedIban = normalizeIban(acct.iban);
    let matched: { gcAccountId: string; iban: string } | null = null;
    const seenIbans: string[] = [];
    for (const gcAccountId of req.accounts) {
      const det = await gc.getAccountDetails(gcAccountId);
      const gotIban = normalizeIban(det.account.iban ?? "");
      seenIbans.push(gotIban || "?");
      if (gotIban && gotIban === expectedIban) {
        matched = { gcAccountId, iban: gotIban };
        break;
      }
    }
    if (!matched) {
      throw new Error(
        `Keine IBAN-Übereinstimmung: Konto erwartet ${expectedIban}, freigegeben ${seenIbans.join(", ")}. Konto-Zuordnung nur per IBAN — bitte richtiges Bank-Konto beim Consent auswählen.`,
      );
    }
    const { error: updErr } = await supabaseAdmin
      .from("bank_accounts")
      .update({ gocardless_account_id: matched.gcAccountId })
      .eq("id", acct.id);
    if (updErr) throw updErr;
    await makeAuditWriter(caller)({
      action: "bank.connect.finalize",
      entity: "bank_accounts",
      entityId: acct.id,
      meta: {
        requisition_id: data.requisitionId,
        gocardless_account_id: matched.gcAccountId,
        iban: matched.iban,
      },
    });
    return { ok: true as const, accountId: acct.id };
  });

export const syncBankTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ accountId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ["admin"]);
    return runSyncForAccount(caller.organizationId, data.accountId, makeAuditWriter(caller));
  });

/** Wiederverwendbarer Sync-Kern — nutzt der interaktive und der Cron-Pfad. */
export async function runSyncForAccount(
  organizationId: string,
  accountId: string,
  audit?: ReturnType<typeof makeAuditWriter>,
): Promise<{ inserted: number; skipped: number; dateFromUsed: string; accountId: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: acct, error: acctErr } = await supabaseAdmin
    .from("bank_accounts")
    .select("id, gocardless_account_id, organization_id")
    .eq("id", accountId)
    .maybeSingle();
  if (acctErr) throw acctErr;
  if (!acct || acct.organization_id !== organizationId) {
    throw new Error("Konto nicht gefunden.");
  }
  if (!acct.gocardless_account_id) {
    throw new Error("Kein GoCardless-Account verknüpft — bitte zuerst 'Bank verbinden'.");
  }
  // date_from bestimmen.
  const [extRes, anyRes] = await Promise.all([
    supabaseAdmin
      .from("bank_transactions")
      .select("buchungstag")
      .eq("organization_id", organizationId)
      .eq("account_id", accountId)
      .not("external_tx_id", "is", null)
      .order("buchungstag", { ascending: false })
      .limit(1),
    supabaseAdmin
      .from("bank_transactions")
      .select("buchungstag")
      .eq("organization_id", organizationId)
      .eq("account_id", accountId)
      .order("buchungstag", { ascending: false })
      .limit(1),
  ]);
  if (extRes.error) throw extRes.error;
  if (anyRes.error) throw anyRes.error;
  const { todayIso: todayIsoFn } = await import("@/lib/format");
  const todayIso = todayIsoFn();
  const dateFromUsed = computeDateFrom({
    today: todayIso,
    maxBookingDateWithExternalTxId: extRes.data?.[0]?.buchungstag ?? null,
    maxBookingDateAny: anyRes.data?.[0]?.buchungstag ?? null,
  });
  const gc = await import("./gocardless.server");
  const resp = await gc.getAccountTransactions(acct.gocardless_account_id, dateFromUsed);
  const mapped = mapGcTransactionsResponse(resp);
  const skipped = mapped.skippedNoId + mapped.skippedNoEur + mapped.skippedNoDate;
  let inserted = 0;
  if (mapped.rows.length > 0) {
    // Vor dem Upsert: welche external_tx_ids gibt es bereits? Damit können wir
    // 'inserted' präzise ausweisen (partial unique-index verhindert Dubletten).
    const incomingIds = mapped.rows.map((r) => r.externalTxId);
    const existingIds = new Set<string>();
    for (const part of chunk(incomingIds, 500)) {
      const { data: ex, error: exErr } = await supabaseAdmin
        .from("bank_transactions")
        .select("external_tx_id")
        .eq("account_id", accountId)
        .in("external_tx_id", part);
      if (exErr) throw exErr;
      for (const row of ex ?? []) if (row.external_tx_id) existingIds.add(row.external_tx_id);
    }
    const payload = mapped.rows.map((r) => ({
      organization_id: organizationId,
      account_id: accountId,
      laufende_nummer: null,
      buchungstag: r.buchungstag,
      wertstellungstag: r.wertstellungstag,
      betrag_cents: r.betragCents,
      saldo_cents: null,
      gegenpartei: r.gegenpartei,
      verwendungszweck: r.verwendungszweck,
      bank_kategorie: "",
      bank_unterkategorie: "",
      external_tx_id: r.externalTxId,
    }));
    const up = await supabaseAdmin.from("bank_transactions").upsert(payload as never, {
      onConflict: "account_id,external_tx_id",
      ignoreDuplicates: true,
    });
    if (up.error) throw up.error;
    inserted = incomingIds.filter((id) => !existingIds.has(id)).length;
  }
  if (audit) {
    await audit({
      action: "bank.sync",
      entity: "bank_accounts",
      entityId: accountId,
      meta: {
        date_from: dateFromUsed,
        rows_received: mapped.rows.length,
        inserted,
        skipped,
        skipped_pending: mapped.skippedPending,
      },
    });
  }
  return { accountId, inserted, skipped, dateFromUsed };
}

// ---- Cross-Account-Duplikatswarnung (Punkt 7) ---------------------------

const findDupsInput = z.object({
  candidateAccountIban: z
    .string()
    .trim()
    .regex(/^[A-Z]{2}\d{2}[A-Z0-9]+$/i, "IBAN unplausibel")
    .max(34),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  candidates: z
    .array(
      z.object({
        buchungstag: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        betragCents: z.number().int(),
        gegenpartei: z.string().max(500),
      }),
    )
    .max(50_000),
});

export const findCrossAccountDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => findDupsInput.parse(i))
  .handler(async ({ data, context }): Promise<CrossAccountSummary[]> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ["admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Alle Konten der Org OHNE das Kandidaten-Konto laden.
    const candIban = normalizeIban(data.candidateAccountIban);
    const { data: accounts, error: aErr } = await supabaseAdmin
      .from("bank_accounts")
      .select("id, iban, name")
      .eq("organization_id", caller.organizationId);
    if (aErr) throw aErr;
    const otherAccountIds = (accounts ?? [])
      .filter((a) => normalizeIban(a.iban) !== candIban)
      .map((a) => a.id);
    if (otherAccountIds.length === 0) return [];
    const acctMeta = new Map<string, { name: string; iban: string }>();
    for (const a of accounts ?? []) acctMeta.set(a.id, { name: a.name, iban: a.iban });
    // Buchungen im überlappenden Zeitraum aller anderen Konten holen.
    const { data: txs, error: tErr } = await supabaseAdmin
      .from("bank_transactions")
      .select("account_id, buchungstag, betrag_cents, gegenpartei")
      .eq("organization_id", caller.organizationId)
      .in("account_id", otherAccountIds)
      .gte("buchungstag", data.dateFrom)
      .lte("buchungstag", data.dateTo)
      .limit(100_000);
    if (tErr) throw tErr;
    const existing: ExistingRow[] = (txs ?? []).map((t) => {
      const meta = acctMeta.get(t.account_id) ?? { name: "?", iban: "?" };
      return {
        accountId: t.account_id,
        accountName: meta.name,
        iban: meta.iban,
        buchungstag: t.buchungstag,
        betragCents: Number(t.betrag_cents),
        gegenpartei: t.gegenpartei ?? "",
      };
    });
    const candidates: CandidateRow[] = data.candidates.map((c) => ({
      buchungstag: c.buchungstag,
      betragCents: c.betragCents,
      gegenpartei: c.gegenpartei,
    }));
    const hits = findCrossAccountMatches(candidates, existing);
    const summary = summarizeCrossAccountHits(hits);
    if (summary.length > 0) {
      await makeAuditWriter(caller)({
        action: "bank.import.cross_account_warn",
        entity: "bank_accounts",
        meta: { candidate_iban: candIban, hits: summary },
      });
    }
    return summary;
  });
