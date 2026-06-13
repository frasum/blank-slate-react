// B3b — Kasse Server-Functions.
//
// Architektur:
//   * RLS auf sessions/Satelliten ist DENY-ALL — alle Writes laufen via
//     supabaseAdmin (dynamic import im Handler).
//   * Schreibgate cash-lock.ts wird VOR jedem Write geprüft.
//   * Auto-Ausstempeln nutzt performClockOut aus time.functions.ts
//     (gleicher Pfad, gleiche Validierung, gleicher Audit-Action).
//   * Korrektur erbt kitchen_tip_rate vom Original — Rate-Änderung
//     beeinflusst keine bereits abgegebene Abrechnung rückwirkend.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller, type AdminCaller } from "@/lib/admin/admin-context";
import { loadStaffCaller, performClockOut, type StaffCaller } from "@/lib/time/time.functions";
import { runGuarded } from "@/lib/admin/admin-call";
import { writeAuditLog } from "@/lib/admin/audit";
import { arbzgMinimumBreak, grossMinutesBetween } from "@/lib/time/break-rules";
import { calcWaiterSettlement } from "./waiter-settlement";
import { assertCashWritable, CashLockedError } from "./cash-lock";
import type { Json } from "@/integrations/supabase/types";

// ------------------------------------------------------------------------
// Fehlerklassen
// ------------------------------------------------------------------------

export class NoOpenSessionError extends Error {
  constructor(public readonly businessDate: string) {
    super(`Keine offene Session für Geschäftstag ${businessDate}.`);
    this.name = "NoOpenSessionError";
  }
}

export class CashLockBackwardsError extends Error {
  constructor() {
    super("Wasserlinie darf nur vorwärts verschoben werden.");
    this.name = "CashLockBackwardsError";
  }
}

export class SettlementNotCorrectableError extends Error {
  constructor(
    public readonly originalId: string,
    public readonly status: string,
  ) {
    super(`Settlement ${originalId} ist nicht korrigierbar (Status: ${status}).`);
    this.name = "SettlementNotCorrectableError";
  }
}

// ------------------------------------------------------------------------
// Hilfsfunktionen
// ------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function getCurrentBusinessDate(): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("current_business_date");
  if (error || !data) throw new Error("current_business_date() RPC fehlgeschlagen.");
  return data as unknown as string;
}

async function loadOrgSettings(orgId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("organization_settings")
    .select("kitchen_tip_rate, cash_locked_through_date")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return {
    kitchenTipRate: Number(data?.kitchen_tip_rate ?? 0.02),
    cashLockedThroughDate: data?.cash_locked_through_date ?? null,
  };
}

async function loadSessionWithLock(orgId: string, sessionId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("sessions")
    .select("id, business_date, status, locked_at")
    .eq("id", sessionId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Session nicht gefunden.");
  return data;
}

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

// ------------------------------------------------------------------------
// Lesen
// ------------------------------------------------------------------------

export const getCashOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ businessDate: z.string().regex(ISO_DATE).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return getCashOverviewCore(caller, data);
  });

export async function getCashOverviewCore(caller: AdminCaller, data: { businessDate?: string }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const settings = await loadOrgSettings(caller.organizationId);
  const businessDate = data.businessDate ?? (await getCurrentBusinessDate());

  const { data: session } = await supabaseAdmin
    .from("sessions")
    .select("*")
    .eq("organization_id", caller.organizationId)
    .eq("business_date", businessDate)
    .maybeSingle();

  if (!session) {
    return {
      businessDate,
      session: null,
      settlements: [],
      channelAmounts: [] as Array<{ channelId: string; amountCents: number }>,
      terminalAmounts: [] as Array<{ terminalId: string; amountCents: number }>,
      expenses: [] as Array<{
        id: string;
        description: string | null;
        amountCents: number;
        createdAt: string;
      }>,
      advances: [] as Array<{
        id: string;
        staffId: string;
        amountCents: number;
        note: string | null;
        createdAt: string;
      }>,
      cardTransactions: [] as Array<{
        id: string;
        terminalId: string | null;
        amountCents: number;
        note: string | null;
        createdAt: string;
      }>,
      bankDeposits: [] as Array<{
        id: string;
        amountCents: number;
        reference: string | null;
        createdAt: string;
      }>,
      registerTransfers: [] as Array<{
        id: string;
        direction: string;
        amountCents: number;
        note: string | null;
        createdAt: string;
      }>,
      cashLockedThroughDate: settings.cashLockedThroughDate,
    };
  }

  const [
    settlementsRes,
    channelAmtRes,
    terminalAmtRes,
    expensesRes,
    advancesRes,
    cardRes,
    bankRes,
    transferRes,
  ] = await Promise.all([
    supabaseAdmin
      .from("waiter_settlements")
      .select(
        "id, staff_id, pos_sales_cents, card_total_cents, hilf_mahl_cents, open_invoices_cents, cash_handed_in_cents, differenz_cents, kitchen_tip_cents, kitchen_tip_rate, status, submitted_at, corrected_from_id, auto_clockout_time_entry_id, staff(display_name)",
      )
      .eq("organization_id", caller.organizationId)
      .eq("session_id", session.id)
      .order("submitted_at", { ascending: true }),
    supabaseAdmin
      .from("session_channel_amounts")
      .select("channel_id, amount_cents")
      .eq("organization_id", caller.organizationId)
      .eq("session_id", session.id),
    supabaseAdmin
      .from("session_terminal_amounts")
      .select("terminal_id, amount_cents")
      .eq("organization_id", caller.organizationId)
      .eq("session_id", session.id),
    supabaseAdmin
      .from("session_expenses")
      .select("id, description, amount_cents, created_at")
      .eq("organization_id", caller.organizationId)
      .eq("session_id", session.id)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("session_advances")
      .select("id, staff_id, amount_cents, note, created_at")
      .eq("organization_id", caller.organizationId)
      .eq("session_id", session.id)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("session_card_transactions")
      .select("id, terminal_id, amount_cents, note, created_at")
      .eq("organization_id", caller.organizationId)
      .eq("session_id", session.id)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("session_bank_deposits")
      .select("id, amount_cents, reference, created_at")
      .eq("organization_id", caller.organizationId)
      .eq("session_id", session.id)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("session_register_transfers")
      .select("id, direction, amount_cents, note, created_at")
      .eq("organization_id", caller.organizationId)
      .eq("session_id", session.id)
      .order("created_at", { ascending: true }),
  ]);

  return {
    businessDate,
    session,
    settlements: (settlementsRes.data ?? []).map((s) => ({
      ...s,
      staffName: (s.staff as { display_name: string } | null)?.display_name ?? "—",
    })),
    channelAmounts: (channelAmtRes.data ?? []).map((r) => ({
      channelId: r.channel_id,
      amountCents: Number(r.amount_cents),
    })),
    terminalAmounts: (terminalAmtRes.data ?? []).map((r) => ({
      terminalId: r.terminal_id,
      amountCents: Number(r.amount_cents),
    })),
    expenses: (expensesRes.data ?? []).map((r) => ({
      id: r.id,
      description: r.description,
      amountCents: Number(r.amount_cents),
      createdAt: r.created_at,
    })),
    advances: (advancesRes.data ?? []).map((r) => ({
      id: r.id,
      staffId: r.staff_id,
      amountCents: Number(r.amount_cents),
      note: r.note,
      createdAt: r.created_at,
    })),
    cardTransactions: (cardRes.data ?? []).map((r) => ({
      id: r.id,
      terminalId: r.terminal_id,
      amountCents: Number(r.amount_cents),
      note: r.note,
      createdAt: r.created_at,
    })),
    bankDeposits: (bankRes.data ?? []).map((r) => ({
      id: r.id,
      amountCents: Number(r.amount_cents),
      reference: r.reference,
      createdAt: r.created_at,
    })),
    registerTransfers: (transferRes.data ?? []).map((r) => ({
      id: r.id,
      direction: r.direction as string,
      amountCents: Number(r.amount_cents),
      note: r.note,
      createdAt: r.created_at,
    })),
    cashLockedThroughDate: settings.cashLockedThroughDate,
  };
}

export const getMySettlement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await loadStaffCaller(context.supabase, context.userId);
    return getMySettlementCore(caller);
  });

export async function getMySettlementCore(caller: StaffCaller) {
  const businessDate = await getCurrentBusinessDate();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const settings = await loadOrgSettings(caller.organizationId);
  const { data: session } = await supabaseAdmin
    .from("sessions")
    .select("id, status")
    .eq("organization_id", caller.organizationId)
    .eq("business_date", businessDate)
    .maybeSingle();
  if (!session) {
    return {
      businessDate,
      session: null,
      settlement: null,
      kitchenTipRate: settings.kitchenTipRate,
    };
  }
  const { data: row } = await supabaseAdmin
    .from("waiter_settlements")
    .select(
      "id, status, pos_sales_cents, card_total_cents, hilf_mahl_cents, open_invoices_cents, cash_handed_in_cents, differenz_cents, kitchen_tip_cents, kitchen_tip_rate, submitted_at, auto_clockout_time_entry_id",
    )
    .eq("organization_id", caller.organizationId)
    .eq("session_id", session.id)
    .eq("staff_id", caller.staffId)
    .neq("status", "superseded")
    .maybeSingle();
  return {
    businessDate,
    session,
    settlement: row,
    kitchenTipRate: settings.kitchenTipRate,
  };
}

// ------------------------------------------------------------------------
// Stammdaten-Reader (Manager+): revenue_channels & payment_terminals
// ------------------------------------------------------------------------

export const listRevenueChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return listRevenueChannelsCore(caller);
  });

export async function listRevenueChannelsCore(caller: AdminCaller) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("revenue_channels")
    .select("id, label, sort_order, is_active")
    .eq("organization_id", caller.organizationId)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    label: r.label,
    sortOrder: r.sort_order,
    isActive: r.is_active,
  }));
}

export const listPaymentTerminals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return listPaymentTerminalsCore(caller);
  });

export async function listPaymentTerminalsCore(caller: AdminCaller) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("payment_terminals")
    .select("id, label, sort_order, is_active")
    .eq("organization_id", caller.organizationId)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    label: r.label,
    sortOrder: r.sort_order,
    isActive: r.is_active,
  }));
}

// ------------------------------------------------------------------------
// Manager: Session
// ------------------------------------------------------------------------

export const getOrCreateOpenSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ businessDate: z.string().regex(ISO_DATE).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return getOrCreateOpenSessionCore(caller, data);
  });

export async function getOrCreateOpenSessionCore(
  caller: AdminCaller,
  data: { businessDate?: string },
) {
  return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
    const businessDate = data.businessDate ?? (await getCurrentBusinessDate());
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("sessions")
      .select("id, status, business_date")
      .eq("organization_id", caller.organizationId)
      .eq("business_date", businessDate)
      .maybeSingle();
    if (existing) {
      return {
        result: { id: existing.id, status: existing.status, businessDate, created: false },
        audit: {
          action: "cash.session.get_existing",
          entity: "session",
          entityId: existing.id,
          meta: { businessDate },
        },
      };
    }
    const { data: created, error } = await supabaseAdmin
      .from("sessions")
      .insert({
        organization_id: caller.organizationId,
        business_date: businessDate,
        status: "open",
      })
      .select("id, status")
      .single();
    if (error) throw error;
    return {
      result: { id: created.id, status: created.status, businessDate, created: true },
      audit: {
        action: "cash.session.created",
        entity: "session",
        entityId: created.id,
        meta: { businessDate },
      },
    };
  });
}

const updateSessionSchema = z.object({
  sessionId: z.string().uuid(),
  channelAmounts: z
    .array(z.object({ channelId: z.string().uuid(), amountCents: z.number().int() }))
    .default([]),
  terminalAmounts: z
    .array(z.object({ terminalId: z.string().uuid(), amountCents: z.number().int() }))
    .default([]),
  vouchersSoldCents: z.number().int().default(0),
  vouchersRedeemedCents: z.number().int().default(0),
  finedineVouchersCents: z.number().int().default(0),
  opentabsDeductionCents: z.number().int().default(0),
  vorschussCents: z.number().int().default(0),
  einladungCents: z.number().int().default(0),
  sonstigeEinnahmeCents: z.number().int().default(0),
  notes: z.string().max(2000).nullable().default(null),
});

export const updateSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => updateSessionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return updateSessionCore(caller, data);
  });

export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;

export async function updateSessionCore(caller: AdminCaller, data: UpdateSessionInput) {
  return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
    const session = await loadSessionWithLock(caller.organizationId, data.sessionId);
    const settings = await loadOrgSettings(caller.organizationId);
    assertCashWritable({
      businessDate: session.business_date,
      sessionStatus: session.status as "open" | "finalized" | "locked",
      sessionLockedAt: session.locked_at,
      cashLockedThroughDate: settings.cashLockedThroughDate,
      // Nach finalize ist die Sessionsicht eingefroren; Korrekturen
      // einzelner Kellner-Abrechnungen laufen über correctWaiterSettlement.
      blockIfFinalized: true,
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: sErr } = await supabaseAdmin
      .from("sessions")
      .update({
        vouchers_sold_cents: data.vouchersSoldCents,
        vouchers_redeemed_cents: data.vouchersRedeemedCents,
        finedine_vouchers_cents: data.finedineVouchersCents,
        opentabs_deduction_cents: data.opentabsDeductionCents,
        vorschuss_cents: data.vorschussCents,
        einladung_cents: data.einladungCents,
        sonstige_einnahme_cents: data.sonstigeEinnahmeCents,
        notes: data.notes,
      })
      .eq("id", session.id)
      .eq("organization_id", caller.organizationId);
    if (sErr) throw sErr;

    // Kanal-Beträge: alte löschen, neue setzen (einfacher als Upsert+Diff).
    await supabaseAdmin
      .from("session_channel_amounts")
      .delete()
      .eq("session_id", session.id)
      .eq("organization_id", caller.organizationId);
    if (data.channelAmounts.length > 0) {
      const { error } = await supabaseAdmin.from("session_channel_amounts").insert(
        data.channelAmounts.map((c) => ({
          organization_id: caller.organizationId,
          session_id: session.id,
          channel_id: c.channelId,
          amount_cents: c.amountCents,
        })),
      );
      if (error) throw error;
    }
    await supabaseAdmin
      .from("session_terminal_amounts")
      .delete()
      .eq("session_id", session.id)
      .eq("organization_id", caller.organizationId);
    if (data.terminalAmounts.length > 0) {
      const { error } = await supabaseAdmin.from("session_terminal_amounts").insert(
        data.terminalAmounts.map((t) => ({
          organization_id: caller.organizationId,
          session_id: session.id,
          terminal_id: t.terminalId,
          amount_cents: t.amountCents,
        })),
      );
      if (error) throw error;
    }

    return {
      result: { ok: true as const },
      audit: {
        action: "cash.session.updated",
        entity: "session",
        entityId: session.id,
        meta: { businessDate: session.business_date },
      },
    };
  });
}

export const finalizeSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ sessionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return finalizeSessionCore(caller, data);
  });

export async function finalizeSessionCore(caller: AdminCaller, data: { sessionId: string }) {
  return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
    const session = await loadSessionWithLock(caller.organizationId, data.sessionId);
    const settings = await loadOrgSettings(caller.organizationId);
    assertCashWritable({
      businessDate: session.business_date,
      sessionStatus: session.status as "open" | "finalized" | "locked",
      sessionLockedAt: session.locked_at,
      cashLockedThroughDate: settings.cashLockedThroughDate,
      blockIfFinalized: true, // Doppel-Finalize verboten.
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("sessions")
      .update({
        status: "finalized",
        finalized_at: new Date().toISOString(),
        finalized_by: caller.staffId,
      })
      .eq("id", session.id)
      .eq("organization_id", caller.organizationId);
    if (error) throw error;
    return {
      result: { ok: true as const },
      audit: {
        action: "cash.session.finalized",
        entity: "session",
        entityId: session.id,
        meta: { businessDate: session.business_date },
      },
    };
  });
}

export const lockSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ sessionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return lockSessionCore(caller, data);
  });

export async function lockSessionCore(caller: AdminCaller, data: { sessionId: string }) {
  return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
    const session = await loadSessionWithLock(caller.organizationId, data.sessionId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("sessions")
      .update({
        status: "locked",
        locked_at: new Date().toISOString(),
        locked_by: caller.staffId,
      })
      .eq("id", session.id)
      .eq("organization_id", caller.organizationId);
    if (error) throw error;
    return {
      result: { ok: true as const },
      audit: {
        action: "cash.session.locked",
        entity: "session",
        entityId: session.id,
        meta: { businessDate: session.business_date },
      },
    };
  });
}

export const setCashLock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        throughDate: z.string().regex(ISO_DATE),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return setCashLockCore(caller, data);
  });

export async function setCashLockCore(
  caller: AdminCaller,
  data: { throughDate: string; reason: string },
) {
  return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
    const settings = await loadOrgSettings(caller.organizationId);
    const before = settings.cashLockedThroughDate;
    if (before && data.throughDate <= before) {
      throw new CashLockBackwardsError();
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("organization_settings").upsert(
      {
        organization_id: caller.organizationId,
        cash_locked_through_date: data.throughDate,
      },
      { onConflict: "organization_id" },
    );
    if (error) throw error;
    return {
      result: { ok: true as const, lockedThrough: data.throughDate },
      audit: {
        action: "cash.lock.advanced",
        entity: "organization_settings",
        entityId: caller.organizationId,
        meta: { from: before, to: data.throughDate, reason: data.reason },
      },
    };
  });
}

// ------------------------------------------------------------------------
// Satelliten
// ------------------------------------------------------------------------

const satelliteAddSchema = z.discriminatedUnion("kind", [
  z.object({
    sessionId: z.string().uuid(),
    kind: z.literal("expense"),
    description: z.string().min(1).max(500),
    amountCents: z.number().int(),
  }),
  z.object({
    sessionId: z.string().uuid(),
    kind: z.literal("advance"),
    staffId: z.string().uuid(),
    amountCents: z.number().int(),
    note: z.string().max(500).nullable().default(null),
  }),
  z.object({
    sessionId: z.string().uuid(),
    kind: z.literal("card_transaction"),
    amountCents: z.number().int(),
    note: z.string().max(500).nullable().default(null),
  }),
  z.object({
    sessionId: z.string().uuid(),
    kind: z.literal("bank_deposit"),
    amountCents: z.number().int(),
    reference: z.string().max(500).nullable().default(null),
  }),
  z.object({
    sessionId: z.string().uuid(),
    kind: z.literal("register_transfer"),
    direction: z.enum(["to_restaurant", "from_restaurant"]),
    amountCents: z.number().int(),
    note: z.string().max(500).nullable().default(null),
  }),
]);

export const addSessionSatellite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => satelliteAddSchema.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return addSessionSatelliteCore(caller, data);
  });

export type AddSatelliteInput = z.infer<typeof satelliteAddSchema>;

export async function addSessionSatelliteCore(caller: AdminCaller, data: AddSatelliteInput) {
  return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
    const session = await loadSessionWithLock(caller.organizationId, data.sessionId);
    const settings = await loadOrgSettings(caller.organizationId);
    assertCashWritable({
      businessDate: session.business_date,
      sessionStatus: session.status as "open" | "finalized" | "locked",
      sessionLockedAt: session.locked_at,
      cashLockedThroughDate: settings.cashLockedThroughDate,
      blockIfFinalized: true,
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let createdId: string | null = null;
    if (data.kind === "expense") {
      const { data: r, error } = await supabaseAdmin
        .from("session_expenses")
        .insert({
          organization_id: caller.organizationId,
          session_id: session.id,
          description: data.description,
          amount_cents: data.amountCents,
        })
        .select("id")
        .single();
      if (error) throw error;
      createdId = r.id;
    } else if (data.kind === "advance") {
      const { data: r, error } = await supabaseAdmin
        .from("session_advances")
        .insert({
          organization_id: caller.organizationId,
          session_id: session.id,
          staff_id: data.staffId,
          amount_cents: data.amountCents,
          note: data.note,
        })
        .select("id")
        .single();
      if (error) throw error;
      createdId = r.id;
    } else if (data.kind === "card_transaction") {
      const { data: r, error } = await supabaseAdmin
        .from("session_card_transactions")
        .insert({
          organization_id: caller.organizationId,
          session_id: session.id,
          amount_cents: data.amountCents,
          note: data.note,
        })
        .select("id")
        .single();
      if (error) throw error;
      createdId = r.id;
    } else if (data.kind === "bank_deposit") {
      const { data: r, error } = await supabaseAdmin
        .from("session_bank_deposits")
        .insert({
          organization_id: caller.organizationId,
          session_id: session.id,
          amount_cents: data.amountCents,
          reference: data.reference,
        })
        .select("id")
        .single();
      if (error) throw error;
      createdId = r.id;
    } else {
      const { data: r, error } = await supabaseAdmin
        .from("session_register_transfers")
        .insert({
          organization_id: caller.organizationId,
          session_id: session.id,
          direction: data.direction,
          amount_cents: data.amountCents,
          note: data.note,
        })
        .select("id")
        .single();
      if (error) throw error;
      createdId = r.id;
    }
    return {
      result: { id: createdId! },
      audit: {
        action: "cash.satellite.added",
        entity: data.kind,
        entityId: createdId!,
        meta: {
          sessionId: session.id,
          businessDate: session.business_date,
          payload: data as unknown as Json,
        },
      },
    };
  });
}

const SATELLITE_TABLE = {
  expense: "session_expenses",
  advance: "session_advances",
  card_transaction: "session_card_transactions",
  bank_deposit: "session_bank_deposits",
  register_transfer: "session_register_transfers",
} as const;

export const removeSessionSatellite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        sessionId: z.string().uuid(),
        kind: z.enum([
          "expense",
          "advance",
          "card_transaction",
          "bank_deposit",
          "register_transfer",
        ]),
        id: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      const session = await loadSessionWithLock(caller.organizationId, data.sessionId);
      const settings = await loadOrgSettings(caller.organizationId);
      assertCashWritable({
        businessDate: session.business_date,
        sessionStatus: session.status as "open" | "finalized" | "locked",
        sessionLockedAt: session.locked_at,
        cashLockedThroughDate: settings.cashLockedThroughDate,
      });
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const table = SATELLITE_TABLE[data.kind];
      const { error } = await supabaseAdmin
        .from(table)
        .delete()
        .eq("id", data.id)
        .eq("session_id", session.id)
        .eq("organization_id", caller.organizationId);
      if (error) throw error;
      return {
        result: { ok: true as const },
        audit: {
          action: "cash.satellite.removed",
          entity: data.kind,
          entityId: data.id,
          meta: { sessionId: session.id, businessDate: session.business_date },
        },
      };
    });
  });

// ------------------------------------------------------------------------
// Kellner: Settlement absenden
// ------------------------------------------------------------------------

const settlementInputSchema = z.object({
  posSalesCents: z.number().int().min(0),
  cardTotalCents: z.number().int().min(0),
  hilfMahlCents: z.number().int().min(0),
  openInvoicesCents: z.number().int().min(0),
  cashHandedInCents: z.number().int().min(0),
});

export const submitWaiterSettlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => settlementInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadStaffCaller(context.supabase, context.userId);
    return submitWaiterSettlementCore(caller, data);
  });

export type SubmitSettlementInput = z.infer<typeof settlementInputSchema>;

export async function submitWaiterSettlementCore(caller: StaffCaller, data: SubmitSettlementInput) {
  if (!caller.isActive) throw new Error("Mitarbeiter ist inaktiv.");
  const businessDate = await getCurrentBusinessDate();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: session } = await supabaseAdmin
    .from("sessions")
    .select("id, business_date, status, locked_at")
    .eq("organization_id", caller.organizationId)
    .eq("business_date", businessDate)
    .maybeSingle();
  if (!session) throw new NoOpenSessionError(businessDate);
  if (session.status !== "open") throw new NoOpenSessionError(businessDate);

  const settings = await loadOrgSettings(caller.organizationId);
  assertCashWritable({
    businessDate: session.business_date,
    sessionStatus: session.status as "open" | "finalized" | "locked",
    sessionLockedAt: session.locked_at,
    cashLockedThroughDate: settings.cashLockedThroughDate,
  });

  // Idempotenz: existierende aktive Zeile prüfen.
  const { data: existing } = await supabaseAdmin
    .from("waiter_settlements")
    .select(
      "id, status, auto_clockout_time_entry_id, kitchen_tip_rate, pos_sales_cents, card_total_cents, hilf_mahl_cents, open_invoices_cents, cash_handed_in_cents",
    )
    .eq("organization_id", caller.organizationId)
    .eq("session_id", session.id)
    .eq("staff_id", caller.staffId)
    .neq("status", "superseded")
    .maybeSingle();

  // Rate snapshotten: draft/neu → aktuelle Org-Rate; submitted → Bestand erhalten.
  const kitchenTipRate =
    existing && existing.status === "submitted"
      ? Number(existing.kitchen_tip_rate)
      : settings.kitchenTipRate;

  const calc = calcWaiterSettlement({
    posSalesCents: data.posSalesCents,
    cardTotalCents: data.cardTotalCents,
    hilfMahlCents: data.hilfMahlCents,
    openInvoicesCents: data.openInvoicesCents,
    kitchenTipRate,
  });

  let settlementId: string;
  let alreadyAutoClockedOut = false;

  if (existing && existing.status === "submitted") {
    // Idempotenz-Pfad: keine erneuten Geld-Änderungen, keine zweite
    // clockOut-Ausführung. Wir geben die bestehende Zeile zurück.
    settlementId = existing.id;
    alreadyAutoClockedOut = existing.auto_clockout_time_entry_id !== null;
    await writeAuditLog({
      organizationId: caller.organizationId,
      actorUserId: caller.userId,
      actorStaffId: caller.staffId,
      action: "cash.settlement.resubmit_noop",
      entity: "waiter_settlement",
      entityId: settlementId,
      meta: { businessDate, sessionId: session.id },
    });
  } else if (existing) {
    // Draft → submitted.
    const { error } = await supabaseAdmin
      .from("waiter_settlements")
      .update({
        pos_sales_cents: data.posSalesCents,
        card_total_cents: data.cardTotalCents,
        hilf_mahl_cents: data.hilfMahlCents,
        open_invoices_cents: data.openInvoicesCents,
        cash_handed_in_cents: data.cashHandedInCents,
        differenz_cents: calc.differenzCents,
        kitchen_tip_cents: calc.kitchenTipCents,
        kitchen_tip_rate: kitchenTipRate,
        status: "submitted",
        submitted_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .eq("organization_id", caller.organizationId);
    if (error) throw error;
    settlementId = existing.id;
  } else {
    const { data: created, error } = await supabaseAdmin
      .from("waiter_settlements")
      .insert({
        organization_id: caller.organizationId,
        session_id: session.id,
        staff_id: caller.staffId,
        pos_sales_cents: data.posSalesCents,
        card_total_cents: data.cardTotalCents,
        hilf_mahl_cents: data.hilfMahlCents,
        open_invoices_cents: data.openInvoicesCents,
        cash_handed_in_cents: data.cashHandedInCents,
        differenz_cents: calc.differenzCents,
        kitchen_tip_cents: calc.kitchenTipCents,
        kitchen_tip_rate: kitchenTipRate,
        status: "submitted",
        submitted_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw error;
    settlementId = created.id;
  }

  // Auto-Ausstempeln — nur wenn nicht bereits passiert.
  let autoClockoutId: string | null = null;
  let noOpenTimeEntry = false;
  if (!alreadyAutoClockedOut) {
    const { data: openTE } = await supabaseAdmin
      .from("time_entries")
      .select("id, started_at")
      .eq("staff_id", caller.staffId)
      .is("ended_at", null)
      .maybeSingle();
    if (openTE) {
      const gross = grossMinutesBetween(new Date(openTE.started_at), new Date());
      const breakMinutes = arbzgMinimumBreak(gross);
      const closed = await performClockOut(caller, breakMinutes, {
        triggered_by: "settlement",
        settlement_id: settlementId,
        arbzg_default: true,
      });
      autoClockoutId = closed?.id ?? null;
      if (autoClockoutId) {
        await supabaseAdmin
          .from("waiter_settlements")
          .update({ auto_clockout_time_entry_id: autoClockoutId })
          .eq("id", settlementId)
          .eq("organization_id", caller.organizationId);
      }
    } else {
      noOpenTimeEntry = true;
    }
  }

  await writeAuditLog({
    organizationId: caller.organizationId,
    actorUserId: caller.userId,
    actorStaffId: caller.staffId,
    action: "cash.settlement.submitted",
    entity: "waiter_settlement",
    entityId: settlementId,
    meta: {
      businessDate,
      sessionId: session.id,
      idempotent: existing?.status === "submitted",
      autoClockoutTimeEntryId: autoClockoutId,
      noOpenTimeEntry,
    },
  });

  return {
    settlementId,
    differenzCents: calc.differenzCents,
    kitchenTipCents: calc.kitchenTipCents,
    autoClockoutTimeEntryId: autoClockoutId,
    noOpenTimeEntry,
    idempotent: existing?.status === "submitted",
  };
}

// ------------------------------------------------------------------------
// Manager: Korrektur
// ------------------------------------------------------------------------

const correctSchema = z.object({
  originalId: z.string().uuid(),
  posSalesCents: z.number().int().min(0),
  cardTotalCents: z.number().int().min(0),
  hilfMahlCents: z.number().int().min(0),
  openInvoicesCents: z.number().int().min(0),
  cashHandedInCents: z.number().int().min(0),
  reason: z.string().trim().min(3).max(500),
});

export const correctWaiterSettlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => correctSchema.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return correctWaiterSettlementCore(caller, data);
  });

export type CorrectSettlementInput = z.infer<typeof correctSchema>;

export async function correctWaiterSettlementCore(
  caller: AdminCaller,
  data: CorrectSettlementInput,
) {
  return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: original, error: loadErr } = await supabaseAdmin
      .from("waiter_settlements")
      .select("id, organization_id, session_id, staff_id, status, kitchen_tip_rate")
      .eq("id", data.originalId)
      .eq("organization_id", caller.organizationId)
      .maybeSingle();
    if (loadErr) throw loadErr;
    if (!original) throw new Error("Original-Settlement nicht gefunden.");
    if (original.status !== "submitted" && original.status !== "corrected") {
      throw new SettlementNotCorrectableError(original.id, original.status);
    }

    const session = await loadSessionWithLock(caller.organizationId, original.session_id);
    const settings = await loadOrgSettings(caller.organizationId);
    // Korrektur erlaubt bei open + finalized; gesperrt bei locked / Wasserlinie.
    assertCashWritable({
      businessDate: session.business_date,
      sessionStatus: session.status as "open" | "finalized" | "locked",
      sessionLockedAt: session.locked_at,
      cashLockedThroughDate: settings.cashLockedThroughDate,
    });

    // Rate ERBEN vom Original — Rate-Änderung darf rückwirkend nichts ändern.
    const inheritedRate = Number(original.kitchen_tip_rate);
    const calc = calcWaiterSettlement({
      posSalesCents: data.posSalesCents,
      cardTotalCents: data.cardTotalCents,
      hilfMahlCents: data.hilfMahlCents,
      openInvoicesCents: data.openInvoicesCents,
      kitchenTipRate: inheritedRate,
    });

    // Reihenfolge: Original superseden ZUERST, damit der partial-Unique-Index
    // (status <> 'superseded') beim Einfügen der neuen Zeile nicht kollidiert.
    const { error: supErr } = await supabaseAdmin
      .from("waiter_settlements")
      .update({ status: "superseded" })
      .eq("id", original.id)
      .eq("organization_id", caller.organizationId);
    if (supErr) throw supErr;

    const { data: created, error: insErr } = await supabaseAdmin
      .from("waiter_settlements")
      .insert({
        organization_id: caller.organizationId,
        session_id: original.session_id,
        staff_id: original.staff_id,
        pos_sales_cents: data.posSalesCents,
        card_total_cents: data.cardTotalCents,
        hilf_mahl_cents: data.hilfMahlCents,
        open_invoices_cents: data.openInvoicesCents,
        cash_handed_in_cents: data.cashHandedInCents,
        differenz_cents: calc.differenzCents,
        kitchen_tip_cents: calc.kitchenTipCents,
        kitchen_tip_rate: inheritedRate,
        status: "submitted",
        submitted_at: new Date().toISOString(),
        corrected_from_id: original.id,
      })
      .select("id")
      .single();
    if (insErr) throw insErr;

    return {
      result: { newId: created.id, originalId: original.id },
      audit: {
        action: "cash.settlement.corrected",
        entity: "waiter_settlement",
        entityId: created.id,
        meta: {
          originalId: original.id,
          newId: created.id,
          reason: data.reason,
          inheritedKitchenTipRate: inheritedRate,
          businessDate: session.business_date,
        },
      },
    };
  });
}

// Re-export für UI/Test-Konsum.
export { CashLockedError };
