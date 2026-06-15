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
import { computeTipPool, type TipPoolResult, type StaffDepartment } from "./tip-pool";
import { assertCashWritable, CashLockedError } from "./cash-lock";
import type { Json } from "@/integrations/supabase/types";
import { ForbiddenError } from "@/lib/admin/role-guard";

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

export class StaffLocationNotBoundError extends Error {
  constructor(
    public readonly staffId: string,
    public readonly locationId: string,
  ) {
    super(`Kellner ${staffId} ist nicht an Standort ${locationId} gebunden.`);
    this.name = "StaffLocationNotBoundError";
  }
}

export class WaiterSettlementAlreadyExistsError extends Error {
  constructor(
    public readonly sessionId: string,
    public readonly staffId: string,
  ) {
    super(
      "Für diesen Kellner existiert bereits eine aktive Abrechnung. Bitte Korrektur statt Neuanlage verwenden.",
    );
    this.name = "WaiterSettlementAlreadyExistsError";
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
    .select("kitchen_tip_rate")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return {
    kitchenTipRate: Number(data?.kitchen_tip_rate ?? 0.02),
  };
}

// Wasserlinie pro Standort aus cash_locks. Null = keine Sperre.
export async function loadLocationCashLock(
  orgId: string,
  locationId: string,
): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("cash_locks")
    .select("locked_through_date")
    .eq("organization_id", orgId)
    .eq("location_id", locationId)
    .maybeSingle();
  if (error) throw error;
  return data?.locked_through_date ?? null;
}

// Cross-Org-Schutz: jeder location-getriebene Aufruf prüft, dass die
// übergebene Location wirklich zur Org des Aufrufers gehört.
export async function assertLocationInOrg(orgId: string, locationId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("id")
    .eq("id", locationId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ForbiddenError();
}

export async function assertStaffBoundToLocation(
  orgId: string,
  staffId: string,
  locationId: string,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("staff_locations")
    .select("id")
    .eq("organization_id", orgId)
    .eq("staff_id", staffId)
    .eq("location_id", locationId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new StaffLocationNotBoundError(staffId, locationId);
}

async function loadSessionWithLock(orgId: string, sessionId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("sessions")
    .select("id, business_date, status, locked_at, location_id")
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
    z
      .object({
        businessDate: z.string().regex(ISO_DATE).optional(),
        locationId: z.string().uuid().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return getCashOverviewCore(caller, data);
  });

export async function getCashOverviewCore(
  caller: AdminCaller,
  data: { businessDate?: string; locationId?: string },
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await loadOrgSettings(caller.organizationId);
  const businessDate = data.businessDate ?? (await getCurrentBusinessDate());

  let sessionQuery = supabaseAdmin
    .from("sessions")
    .select("*")
    .eq("organization_id", caller.organizationId)
    .eq("business_date", businessDate);
  if (data.locationId) {
    await assertLocationInOrg(caller.organizationId, data.locationId);
    sessionQuery = sessionQuery.eq("location_id", data.locationId);
  }
  const { data: session } = await sessionQuery.maybeSingle();

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
      cashLockedThroughDate: null as string | null,
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
    cashLockedThroughDate: await loadLocationCashLock(caller.organizationId, session.location_id),
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
// B4 — Trinkgeld-Pool Overview
// ------------------------------------------------------------------------

export const getTipPoolOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ sessionId: z.string().uuid() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return getTipPoolOverviewCore(caller, data);
  });

export async function getTipPoolOverviewCore(
  caller: AdminCaller,
  data: { sessionId: string },
): Promise<TipPoolResult & { staffNames: Record<string, string> }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const session = await loadSessionWithLock(caller.organizationId, data.sessionId);

  const [settlementsRes, timeRes] = await Promise.all([
    supabaseAdmin
      .from("waiter_settlements")
      .select(
        "staff_id, pos_sales_cents, card_total_cents, open_invoices_cents, kitchen_tip_cents, status",
      )
      .eq("organization_id", caller.organizationId)
      .eq("session_id", session.id)
      .neq("status", "superseded"),
    supabaseAdmin
      .from("time_entries")
      .select("staff_id, started_at, ended_at")
      .eq("organization_id", caller.organizationId)
      .eq("location_id", session.location_id)
      .eq("business_date", session.business_date)
      .not("ended_at", "is", null),
  ]);
  if (settlementsRes.error) throw settlementsRes.error;
  if (timeRes.error) throw timeRes.error;

  const settlements = (settlementsRes.data ?? []).map((r) => ({
    staffId: r.staff_id,
    posSalesCents: Number(r.pos_sales_cents),
    cardTotalCents: Number(r.card_total_cents),
    openInvoicesCents: Number(r.open_invoices_cents),
    kitchenTipCents: Number(r.kitchen_tip_cents),
  }));
  const timeEntries = (timeRes.data ?? [])
    .filter(
      (r): r is { staff_id: string; started_at: string; ended_at: string } => r.ended_at !== null,
    )
    .map((r) => ({ staffId: r.staff_id, startedAt: r.started_at, endedAt: r.ended_at }));

  const kitchenPoolCents = settlements.reduce((s, x) => s + x.kitchenTipCents, 0);
  const tipTotalCents = settlements.reduce(
    (s, x) => s + x.posSalesCents + x.cardTotalCents - x.openInvoicesCents,
    0,
  );
  const servicePoolCents = tipTotalCents - kitchenPoolCents;

  const staffIds = Array.from(
    new Set<string>([...settlements.map((s) => s.staffId), ...timeEntries.map((t) => t.staffId)]),
  );

  const staffDepartments = new Map<string, StaffDepartment>();
  const staffParticipates = new Map<string, boolean>();
  const staffNames: Record<string, string> = {};

  if (staffIds.length > 0) {
    const [slRes, staffRes] = await Promise.all([
      supabaseAdmin
        .from("staff_locations")
        .select("staff_id, department")
        .eq("organization_id", caller.organizationId)
        .eq("location_id", session.location_id)
        .in("staff_id", staffIds),
      supabaseAdmin
        .from("staff")
        .select("id, display_name, participates_in_pool")
        .eq("organization_id", caller.organizationId)
        .in("id", staffIds),
    ]);
    if (slRes.error) throw slRes.error;
    if (staffRes.error) throw staffRes.error;
    for (const r of slRes.data ?? []) {
      staffDepartments.set(r.staff_id, r.department as StaffDepartment);
    }
    for (const r of staffRes.data ?? []) {
      staffParticipates.set(r.id, Boolean(r.participates_in_pool));
      staffNames[r.id] = r.display_name ?? "—";
    }
  }

  const result = computeTipPool({
    kitchenPoolCents,
    servicePoolCents,
    settlements,
    timeEntries,
    staffDepartments,
    staffParticipates,
  });

  return { ...result, staffNames };
}

// ------------------------------------------------------------------------
// Stammdaten-Reader (Manager+): revenue_channels & payment_terminals
// ------------------------------------------------------------------------

export const listRevenueChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ locationId: z.string().uuid().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return listRevenueChannelsCore(caller, data?.locationId);
  });

export async function listRevenueChannelsCore(caller: AdminCaller, locationId?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let query = supabaseAdmin
    .from("revenue_channels")
    .select("id, label, kind, sort_order, is_active")
    .eq("organization_id", caller.organizationId);
  if (locationId) query = query.eq("location_id", locationId);
  const { data, error } = await query
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    label: r.label,
    kind: r.kind as string,
    sortOrder: r.sort_order,
    isActive: r.is_active,
  }));
}

export const listPaymentTerminals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ locationId: z.string().uuid().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return listPaymentTerminalsCore(caller, data?.locationId);
  });

export async function listPaymentTerminalsCore(caller: AdminCaller, locationId?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let query = supabaseAdmin
    .from("payment_terminals")
    .select("id, label, sort_order, is_active")
    .eq("organization_id", caller.organizationId);
  if (locationId) query = query.eq("location_id", locationId);
  const { data, error } = await query
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
    z
      .object({
        businessDate: z.string().regex(ISO_DATE).optional(),
        locationId: z.string().uuid(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return getOrCreateOpenSessionCore(caller, data);
  });

export async function getOrCreateOpenSessionCore(
  caller: AdminCaller,
  data: { businessDate?: string; locationId: string },
) {
  return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
    const businessDate = data.businessDate ?? (await getCurrentBusinessDate());
    await assertLocationInOrg(caller.organizationId, data.locationId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("sessions")
      .select("id, status, business_date")
      .eq("organization_id", caller.organizationId)
      .eq("location_id", data.locationId)
      .eq("business_date", businessDate)
      .maybeSingle();
    if (existing) {
      return {
        result: { id: existing.id, status: existing.status, businessDate, created: false },
        audit: {
          action: "cash.session.get_existing",
          entity: "session",
          entityId: existing.id,
          meta: { businessDate, locationId: data.locationId },
        },
      };
    }
    const { data: created, error } = await supabaseAdmin
      .from("sessions")
      .insert({
        organization_id: caller.organizationId,
        location_id: data.locationId,
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
        meta: { businessDate, locationId: data.locationId },
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
  vectronDailyTotalCents: z.number().int().optional(),
  cashActualCents: z.number().int().nullable().optional(),
  guestCount: z.number().int().nonnegative().default(0),
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
    const waterline = await loadLocationCashLock(caller.organizationId, session.location_id);
    assertCashWritable({
      businessDate: session.business_date,
      sessionStatus: session.status as "open" | "finalized" | "locked",
      sessionLockedAt: session.locked_at,
      cashLockedThroughDate: waterline,
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
        vectron_daily_total_cents: data.vectronDailyTotalCents ?? 0,
        cash_actual_cents: data.cashActualCents ?? null,
        guest_count: data.guestCount,
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
    const waterline = await loadLocationCashLock(caller.organizationId, session.location_id);
    assertCashWritable({
      businessDate: session.business_date,
      sessionStatus: session.status as "open" | "finalized" | "locked",
      sessionLockedAt: session.locked_at,
      cashLockedThroughDate: waterline,
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
        locationId: z.string().uuid(),
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
  data: { locationId: string; throughDate: string; reason: string },
) {
  return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
    await assertLocationInOrg(caller.organizationId, data.locationId);
    const before = await loadLocationCashLock(caller.organizationId, data.locationId);
    if (before && data.throughDate <= before) {
      throw new CashLockBackwardsError();
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("cash_locks").upsert(
      {
        organization_id: caller.organizationId,
        location_id: data.locationId,
        locked_through_date: data.throughDate,
        updated_by: caller.staffId,
      },
      { onConflict: "organization_id,location_id" },
    );
    if (error) throw error;
    return {
      result: { ok: true as const, lockedThrough: data.throughDate },
      audit: {
        action: "cash.lock.advanced",
        entity: "cash_locks",
        entityId: data.locationId,
        meta: {
          locationId: data.locationId,
          from: before,
          to: data.throughDate,
          reason: data.reason,
        },
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
    direction: z.enum(["to_restaurant", "to_safe", "to_other", "from_restaurant"]),
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
    const waterline = await loadLocationCashLock(caller.organizationId, session.location_id);
    assertCashWritable({
      businessDate: session.business_date,
      sessionStatus: session.status as "open" | "finalized" | "locked",
      sessionLockedAt: session.locked_at,
      cashLockedThroughDate: waterline,
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
      const waterline = await loadLocationCashLock(caller.organizationId, session.location_id);
      assertCashWritable({
        businessDate: session.business_date,
        sessionStatus: session.status as "open" | "finalized" | "locked",
        sessionLockedAt: session.locked_at,
        cashLockedThroughDate: waterline,
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

  // Mehrstandort: alle Sessions des Tages laden. Existiert genau eine,
  // wird gegen die staff_locations-Bindung des Kellners geprüft —
  // fehlt sie, schlägt der Aufruf mit StaffLocationNotBoundError fehl.
  // Existieren mehrere (mehrere Standorte gleichzeitig offen), wird
  // die auf den Kellner passende ausgewählt.
  const { data: sessions, error: sErr } = await supabaseAdmin
    .from("sessions")
    .select("id, business_date, status, locked_at, location_id")
    .eq("organization_id", caller.organizationId)
    .eq("business_date", businessDate);
  if (sErr) throw sErr;
  if (!sessions || sessions.length === 0) throw new NoOpenSessionError(businessDate);

  let session: (typeof sessions)[number];
  if (sessions.length === 1) {
    session = sessions[0];
    await assertStaffBoundToLocation(caller.organizationId, caller.staffId, session.location_id);
  } else {
    const { data: bound, error: blErr } = await supabaseAdmin
      .from("staff_locations")
      .select("location_id")
      .eq("organization_id", caller.organizationId)
      .eq("staff_id", caller.staffId);
    if (blErr) throw blErr;
    const boundIds = new Set((bound ?? []).map((r) => r.location_id));
    const matches = sessions.filter((s) => boundIds.has(s.location_id));
    if (matches.length === 0) {
      throw new StaffLocationNotBoundError(caller.staffId, sessions[0].location_id);
    }
    if (matches.length > 1) {
      throw new Error(
        "Mehrdeutige Session: Kellner ist an mehreren Standorten mit offener Session gebunden.",
      );
    }
    session = matches[0];
  }
  if (session.status !== "open") throw new NoOpenSessionError(businessDate);

  const settings = await loadOrgSettings(caller.organizationId);
  const waterline = await loadLocationCashLock(caller.organizationId, session.location_id);
  assertCashWritable({
    businessDate: session.business_date,
    sessionStatus: session.status as "open" | "finalized" | "locked",
    sessionLockedAt: session.locked_at,
    cashLockedThroughDate: waterline,
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
    const waterline = await loadLocationCashLock(caller.organizationId, session.location_id);
    // Korrektur erlaubt bei open + finalized; gesperrt bei locked / Wasserlinie.
    assertCashWritable({
      businessDate: session.business_date,
      sessionStatus: session.status as "open" | "finalized" | "locked",
      sessionLockedAt: session.locked_at,
      cashLockedThroughDate: waterline,
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

// ------------------------------------------------------------------------
// Admin: Manuelle Neuanlage einer Kellner-Abrechnung
// ------------------------------------------------------------------------
//
// Reine Geld-Erfassung durch Admin/Manager. KEIN Auto-Clockout (im
// Gegensatz zu submitWaiterSettlement). Kitchen-Tip-Rate wird zum
// Zeitpunkt der Anlage aus den aktuellen Org-Settings gesnapshottet
// (es gibt kein Original, von dem geerbt werden könnte).

const adminCreateSettlementSchema = z.object({
  sessionId: z.string().uuid(),
  staffId: z.string().uuid(),
  posSalesCents: z.number().int().min(0),
  cardTotalCents: z.number().int().min(0),
  hilfMahlCents: z.number().int().min(0),
  openInvoicesCents: z.number().int().min(0),
  cashHandedInCents: z.number().int().min(0),
  reason: z.string().trim().min(3).max(500),
});

export const adminCreateWaiterSettlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => adminCreateSettlementSchema.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return adminCreateWaiterSettlementCore(caller, data);
  });

export type AdminCreateSettlementInput = z.infer<typeof adminCreateSettlementSchema>;

export async function adminCreateWaiterSettlementCore(
  caller: AdminCaller,
  data: AdminCreateSettlementInput,
) {
  return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
    const session = await loadSessionWithLock(caller.organizationId, data.sessionId);
    const waterline = await loadLocationCashLock(caller.organizationId, session.location_id);
    // Anlage erlaubt bei open/finalized; gesperrt bei locked/Wasserlinie
    // (gleiche Regeln wie correctWaiterSettlement).
    assertCashWritable({
      businessDate: session.business_date,
      sessionStatus: session.status as "open" | "finalized" | "locked",
      sessionLockedAt: session.locked_at,
      cashLockedThroughDate: waterline,
    });

    await assertStaffBoundToLocation(caller.organizationId, data.staffId, session.location_id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Duplikate verhindern — falls bereits aktive Zeile, Korrektur-Pfad nutzen.
    const { data: existing, error: exErr } = await supabaseAdmin
      .from("waiter_settlements")
      .select("id, status")
      .eq("organization_id", caller.organizationId)
      .eq("session_id", session.id)
      .eq("staff_id", data.staffId)
      .neq("status", "superseded")
      .maybeSingle();
    if (exErr) throw exErr;
    if (existing) throw new WaiterSettlementAlreadyExistsError(session.id, data.staffId);

    const settings = await loadOrgSettings(caller.organizationId);
    const calc = calcWaiterSettlement({
      posSalesCents: data.posSalesCents,
      cardTotalCents: data.cardTotalCents,
      hilfMahlCents: data.hilfMahlCents,
      openInvoicesCents: data.openInvoicesCents,
      kitchenTipRate: settings.kitchenTipRate,
    });

    const { data: created, error: insErr } = await supabaseAdmin
      .from("waiter_settlements")
      .insert({
        organization_id: caller.organizationId,
        session_id: session.id,
        staff_id: data.staffId,
        pos_sales_cents: data.posSalesCents,
        card_total_cents: data.cardTotalCents,
        hilf_mahl_cents: data.hilfMahlCents,
        open_invoices_cents: data.openInvoicesCents,
        cash_handed_in_cents: data.cashHandedInCents,
        differenz_cents: calc.differenzCents,
        kitchen_tip_cents: calc.kitchenTipCents,
        kitchen_tip_rate: settings.kitchenTipRate,
        status: "submitted",
        submitted_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (insErr) throw insErr;

    return {
      result: {
        newId: created.id,
        differenzCents: calc.differenzCents,
        kitchenTipCents: calc.kitchenTipCents,
      },
      audit: {
        action: "cash.settlement.admin_created",
        entity: "waiter_settlement",
        entityId: created.id,
        meta: {
          sessionId: session.id,
          staffId: data.staffId,
          businessDate: session.business_date,
          reason: data.reason,
          kitchenTipRate: settings.kitchenTipRate,
        },
      },
    };
  });
}

// ------------------------------------------------------------------------
// B3c-2 — Kassensaldo-Kette (Carry-over) über einen Datumsbereich
// ------------------------------------------------------------------------
//
// Liest alle Sessions im Bereich [fromDate, toDate] (admin-only,
// organization_id-scoped), baut je Session einen DayInput, aggregiert
// gleiche business_date-Tage und reicht das Ganze durch accumulateChain
// aus cash-ledger.ts. Opening-Balance des ersten Tages = Σ
// opening_balance_cents aller Sessions an diesem Tag — damit closing[N]
// = opening[N+1] strikt innerhalb des Bereichs gilt.

import { accumulateChain, type DayInput, type TransferDirection } from "./cash-ledger";
import { computeSafeChain, type SafeDayInput } from "./safe-balance";

export type CashLedgerRow = {
  businessDate: string;
  status: "open" | "finalized" | "locked" | "mixed" | "none";
  openingBalanceCents: number;
  totalRevenueCents: number;
  totalExpensesCents: number;
  closingBalanceCents: number;
  differenzCents: number;
  cashActualCents: number | null;
  surplusCents: number | null;
  shortfallCents: number | null;
  safeBalanceCents: number;
};

export const getCashLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        fromDate: z.string().regex(ISO_DATE),
        toDate: z.string().regex(ISO_DATE),
      })
      .refine((v) => v.fromDate <= v.toDate, { message: "fromDate > toDate" })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return getCashLedgerCore(caller, data);
  });

export async function getCashLedgerCore(
  caller: AdminCaller,
  data: { fromDate: string; toDate: string },
): Promise<CashLedgerRow[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: sessions, error: sErr } = await supabaseAdmin
    .from("sessions")
    .select(
      "id, business_date, status, location_id, opening_balance_cents, vouchers_sold_cents, vouchers_redeemed_cents, finedine_vouchers_cents, vorschuss_cents, einladung_cents, sonstige_einnahme_cents, cash_actual_cents",
    )
    .eq("organization_id", caller.organizationId)
    .gte("business_date", data.fromDate)
    .lte("business_date", data.toDate)
    .order("business_date", { ascending: true });
  if (sErr) throw sErr;
  if (!sessions || sessions.length === 0) return [];

  const { data: org, error: orgErr } = await supabaseAdmin
    .from("organizations")
    .select("cash_balance_target_cents, opening_safe_balance_cents")
    .eq("id", caller.organizationId)
    .maybeSingle();
  if (orgErr) throw orgErr;
  const cashTarget = Number(org?.cash_balance_target_cents ?? 200_000);
  const openingSafe = Number(org?.opening_safe_balance_cents ?? 200_000);

  const sessionIds = sessions.map((s) => s.id);

  const [chRes, tRes, expRes, advRes, depRes, trRes, wsRes] = await Promise.all([
    supabaseAdmin
      .from("session_channel_amounts")
      .select("session_id, amount_cents, revenue_channels(kind)")
      .eq("organization_id", caller.organizationId)
      .in("session_id", sessionIds),
    supabaseAdmin
      .from("session_terminal_amounts")
      .select("session_id, amount_cents")
      .eq("organization_id", caller.organizationId)
      .in("session_id", sessionIds),
    supabaseAdmin
      .from("session_expenses")
      .select("session_id, amount_cents")
      .eq("organization_id", caller.organizationId)
      .in("session_id", sessionIds),
    supabaseAdmin
      .from("session_advances")
      .select("session_id, amount_cents")
      .eq("organization_id", caller.organizationId)
      .in("session_id", sessionIds),
    supabaseAdmin
      .from("session_bank_deposits")
      .select("session_id, amount_cents")
      .eq("organization_id", caller.organizationId)
      .in("session_id", sessionIds),
    supabaseAdmin
      .from("session_register_transfers")
      .select("session_id, direction, amount_cents")
      .eq("organization_id", caller.organizationId)
      .in("session_id", sessionIds),
    supabaseAdmin
      .from("waiter_settlements")
      .select("session_id, open_invoices_cents, differenz_cents, status")
      .eq("organization_id", caller.organizationId)
      .in("session_id", sessionIds)
      .neq("status", "superseded"),
  ]);
  if (chRes.error) throw chRes.error;
  if (tRes.error) throw tRes.error;
  if (expRes.error) throw expRes.error;
  if (advRes.error) throw advRes.error;
  if (depRes.error) throw depRes.error;
  if (trRes.error) throw trRes.error;
  if (wsRes.error) throw wsRes.error;

  type Agg = {
    statuses: Set<string>;
    grossRevenue: number;
    cardTotal: number;
    deliverySouse: number;
    deliveryWolt: number;
    vouchersSold: number;
    vouchersRedeemed: number;
    finedine: number;
    einladung: number;
    sonstige: number;
    vorschuss: number;
    openInvoices: number[];
    expenses: number[];
    advances: number[];
    bankDeposits: number[];
    cardTransactions: number[];
    transfers: Array<{ direction: TransferDirection; amountCents: number }>;
    openingBalance: number;
    totalRevenueGross: number;
    totalExpenses: number;
    differenz: number;
    cashActualSum: number;
    cashActualCount: number;
    sessionCount: number;
  };
  const byDate = new Map<string, Agg>();
  const sessionDate = new Map<string, string>();
  const firstDateSessions = new Set<string>();

  const sortedDates = Array.from(new Set(sessions.map((s) => s.business_date))).sort();
  const firstDate = sortedDates[0];

  function getAgg(date: string): Agg {
    let a = byDate.get(date);
    if (!a) {
      a = {
        statuses: new Set(),
        grossRevenue: 0,
        cardTotal: 0,
        deliverySouse: 0,
        deliveryWolt: 0,
        vouchersSold: 0,
        vouchersRedeemed: 0,
        finedine: 0,
        einladung: 0,
        sonstige: 0,
        vorschuss: 0,
        openInvoices: [],
        expenses: [],
        advances: [],
        bankDeposits: [],
        cardTransactions: [],
        transfers: [],
        openingBalance: 0,
        totalRevenueGross: 0,
        totalExpenses: 0,
        differenz: 0,
        cashActualSum: 0,
        cashActualCount: 0,
        sessionCount: 0,
      };
      byDate.set(date, a);
    }
    return a;
  }

  for (const s of sessions) {
    sessionDate.set(s.id, s.business_date);
    if (s.business_date === firstDate) firstDateSessions.add(s.id);
    const a = getAgg(s.business_date);
    a.statuses.add(s.status as string);
    a.sessionCount += 1;
    if (s.cash_actual_cents !== null && s.cash_actual_cents !== undefined) {
      a.cashActualSum += Number(s.cash_actual_cents);
      a.cashActualCount += 1;
    }
    // Session-Pauschalfelder (Quirk: vorschuss wird ignoriert, falls
    // advances-Satellit vorhanden — siehe effectiveVorschussCents).
    a.vouchersSold += Number(s.vouchers_sold_cents ?? 0);
    a.vouchersRedeemed += Number(s.vouchers_redeemed_cents ?? 0);
    a.finedine += Number(s.finedine_vouchers_cents ?? 0);
    a.einladung += Number(s.einladung_cents ?? 0);
    a.sonstige += Number(s.sonstige_einnahme_cents ?? 0);
    a.vorschuss += Number(s.vorschuss_cents ?? 0);
    if (s.business_date === firstDate) {
      a.openingBalance += Number(s.opening_balance_cents ?? 0);
    }
  }

  for (const r of chRes.data ?? []) {
    const d = sessionDate.get(r.session_id);
    if (!d) continue;
    const a = getAgg(d);
    const amt = Number(r.amount_cents);
    a.totalRevenueGross += amt;
    const kind = (r.revenue_channels as { kind: string } | null)?.kind ?? null;
    switch (kind) {
      case "pos":
        a.grossRevenue += amt;
        break;
      case "delivery_souse":
      case "delivery_vectron":
        a.deliverySouse += amt;
        break;
      case "delivery_wolt":
        a.deliveryWolt += amt;
        break;
      case "voucher_sold":
        a.vouchersSold += amt;
        break;
      case "voucher_redeemed":
        a.vouchersRedeemed += amt;
        break;
      case "finedine":
        a.finedine += amt;
        break;
      case "einladung":
        a.einladung += amt;
        break;
      case "sonstige":
        a.sonstige += amt;
        break;
      default:
        break;
    }
  }
  for (const r of tRes.data ?? []) {
    const d = sessionDate.get(r.session_id);
    if (!d) continue;
    getAgg(d).cardTotal += Number(r.amount_cents);
  }
  for (const r of expRes.data ?? []) {
    const d = sessionDate.get(r.session_id);
    if (!d) continue;
    const a = getAgg(d);
    const amt = Number(r.amount_cents);
    a.expenses.push(amt);
    a.totalExpenses += amt;
  }
  for (const r of advRes.data ?? []) {
    const d = sessionDate.get(r.session_id);
    if (!d) continue;
    getAgg(d).advances.push(Number(r.amount_cents));
  }
  for (const r of depRes.data ?? []) {
    const d = sessionDate.get(r.session_id);
    if (!d) continue;
    getAgg(d).bankDeposits.push(Number(r.amount_cents));
  }
  for (const r of trRes.data ?? []) {
    const d = sessionDate.get(r.session_id);
    if (!d) continue;
    getAgg(d).transfers.push({
      direction: r.direction as TransferDirection,
      amountCents: Number(r.amount_cents),
    });
  }
  for (const r of wsRes.data ?? []) {
    const d = sessionDate.get(r.session_id);
    if (!d) continue;
    const a = getAgg(d);
    a.openInvoices.push(Number(r.open_invoices_cents));
    a.differenz += Number(r.differenz_cents);
  }

  const days: DayInput[] = sortedDates.map((date) => {
    const a = getAgg(date);
    return {
      businessDate: date,
      grossRevenueCents: a.grossRevenue,
      cardTotalCents: a.cardTotal,
      deliverySouseCents: a.deliverySouse,
      deliveryWoltCents: a.deliveryWolt,
      vouchersSoldCents: a.vouchersSold,
      vouchersRedeemedCents: a.vouchersRedeemed,
      finedineVouchersCents: a.finedine,
      einladungCents: a.einladung,
      openInvoicesCents: a.openInvoices,
      sonstigeEinnahmeCents: a.sonstige,
      vorschussCents: a.vorschuss,
      satellites: {
        expensesCents: a.expenses,
        advancesCents: a.advances,
        cardTransactionsCents: a.cardTransactions,
        bankDepositsCents: a.bankDeposits,
        registerTransfers: a.transfers,
      },
    };
  });

  const openingBalanceCents = getAgg(firstDate).openingBalance;
  const chain = accumulateChain(openingBalanceCents, days);

  const safeDays: SafeDayInput[] = sortedDates.map((date) => {
    const a = getAgg(date);
    return {
      businessDate: date,
      cashActualCents: a.cashActualCount > 0 ? a.cashActualSum : null,
      cashTargetCents: cashTarget * Math.max(1, a.sessionCount),
      bankDepositsCents: a.bankDeposits,
    };
  });
  const safeChain = computeSafeChain(openingSafe, safeDays);

  return sortedDates.map((date, i) => {
    const a = getAgg(date);
    const r = chain[i];
    const sr = safeChain[i];
    const statuses = Array.from(a.statuses);
    const status: CashLedgerRow["status"] =
      statuses.length === 0
        ? "none"
        : statuses.length === 1
          ? (statuses[0] as CashLedgerRow["status"])
          : "mixed";
    return {
      businessDate: date,
      status,
      openingBalanceCents: r.previousCarryCents,
      totalRevenueCents: a.totalRevenueGross,
      totalExpensesCents: a.totalExpenses,
      closingBalanceCents: r.remainingCashCents,
      differenzCents: a.differenz,
      cashActualCents: sr.cashActualCents,
      surplusCents: sr.surplusCents,
      shortfallCents: sr.shortfallCents,
      safeBalanceCents: sr.safeBalanceCents,
    };
  });
}
