// TA1 — Schichttausch (Server-Functions).
//
// Grundsatz:
//  - staffId kommt IMMER aus loadStaffCaller (auth.uid → user_links).
//    Der Client kann keine Identität mit-schicken.
//  - Alle Schreibpfade nutzen supabaseAdmin NACH Berechtigungsprüfung.
//  - shift_swap_requests und shift_swap_declines sind DENY-ALL für Clients.
//  - KEINE Änderung an roster_shifts. Der Vollzug ist TA2 (Manager-Genehmigung).
//  - Perioden-Sperren werden respektiert wie bei roster.functions.
//  - Audit bei jeder Schreibaktion.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadStaffCaller } from "@/lib/time/time.functions";
import { writeAuditLog } from "@/lib/admin/audit";
import {
  canAcceptCounterShift,
  canOfferShift,
  eligiblePeerFilter,
  type SwapArea,
  type SwapPeer,
  type SwapShift,
} from "./swap-rules";

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function assertShiftDateUnlocked(
  admin: SupabaseClient<Database>,
  organizationId: string,
  shiftDate: string,
): Promise<void> {
  const { data, error } = await admin
    .from("periods")
    .select("status")
    .eq("organization_id", organizationId)
    .lte("start_date", shiftDate)
    .gte("end_date", shiftDate)
    .maybeSingle();
  if (error) throw error;
  if (data?.status === "locked") throw new Error("Periode gesperrt");
}

type ShiftRow = {
  id: string;
  staff_id: string;
  location_id: string;
  area: SwapArea;
  shift_date: string;
  organization_id: string;
};

async function loadShift(
  admin: SupabaseClient<Database>,
  organizationId: string,
  shiftId: string,
): Promise<ShiftRow> {
  const { data, error } = await admin
    .from("roster_shifts")
    .select("id, staff_id, location_id, area, shift_date, organization_id")
    .eq("id", shiftId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Schicht nicht gefunden.");
  return data as ShiftRow;
}

async function hasActiveRequestForShift(
  admin: SupabaseClient<Database>,
  shiftId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("shift_swap_requests")
    .select("id")
    .eq("shift_id", shiftId)
    .in("status", ["open", "peer_accepted"])
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

async function loadPeerForShift(
  admin: SupabaseClient<Database>,
  organizationId: string,
  peerStaffId: string,
  shift: SwapShift,
): Promise<SwapPeer | null> {
  const { data: staff, error: staffErr } = await admin
    .from("staff")
    .select("id, is_active")
    .eq("id", peerStaffId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (staffErr) throw staffErr;
  if (!staff) return null;
  const { data: scopes, error: scopeErr } = await admin
    .from("staff_locations")
    .select("location_id, department")
    .eq("staff_id", peerStaffId)
    .eq("organization_id", organizationId);
  if (scopeErr) throw scopeErr;
  const { data: dayShifts, error: dayErr } = await admin
    .from("roster_shifts")
    .select("shift_date")
    .eq("organization_id", organizationId)
    .eq("staff_id", peerStaffId)
    .eq("location_id", shift.locationId)
    .eq("area", shift.area)
    .eq("shift_date", shift.shiftDate);
  if (dayErr) throw dayErr;
  return {
    staffId: peerStaffId,
    isActive: !!staff.is_active,
    scopes: (scopes ?? []).map((s) => ({
      locationId: s.location_id as string,
      area: s.department as SwapArea,
    })),
    shiftDatesAtScope: new Set((dayShifts ?? []).map((r) => r.shift_date as string)),
  };
}

/**
 * Liefert alle staff_ids der Organisation, die grundsätzlich in Frage kommen
 * (Standort + Bereich passt, aktiv, nicht der Anfragende). Der Tageskonflikt
 * wird pro Kandidat mit eligiblePeerFilter geprüft.
 */
async function eligiblePeerStaffIds(
  admin: SupabaseClient<Database>,
  organizationId: string,
  shift: SwapShift,
): Promise<string[]> {
  const { data: scopeRows, error: scopeErr } = await admin
    .from("staff_locations")
    .select("staff_id")
    .eq("organization_id", organizationId)
    .eq("location_id", shift.locationId)
    .eq("department", shift.area);
  if (scopeErr) throw scopeErr;
  const candidateIds = Array.from(
    new Set(
      (scopeRows ?? [])
        .map((r) => r.staff_id as string)
        .filter((id) => id !== shift.staffId),
    ),
  );
  if (candidateIds.length === 0) return [];
  const { data: activeRows, error: activeErr } = await admin
    .from("staff")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .in("id", candidateIds);
  if (activeErr) throw activeErr;
  const activeSet = new Set((activeRows ?? []).map((r) => r.id as string));
  const active = candidateIds.filter((id) => activeSet.has(id));
  if (active.length === 0) return [];
  const { data: dayRows, error: dayErr } = await admin
    .from("roster_shifts")
    .select("staff_id")
    .eq("organization_id", organizationId)
    .eq("location_id", shift.locationId)
    .eq("area", shift.area)
    .eq("shift_date", shift.shiftDate)
    .in("staff_id", active);
  if (dayErr) throw dayErr;
  const conflicting = new Set((dayRows ?? []).map((r) => r.staff_id as string));
  return active.filter((id) => !conflicting.has(id));
}

// ---------------------------------------------------------------------------
// createSwapRequest
// ---------------------------------------------------------------------------

export const createSwapRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        shiftId: z.string().uuid(),
        note: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadStaffCaller(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const shift = await loadShift(supabaseAdmin, caller.organizationId, data.shiftId);
    if (shift.staff_id !== caller.staffId) {
      throw new Error("Nur eigene Schichten können angeboten werden.");
    }
    const active = await hasActiveRequestForShift(supabaseAdmin, shift.id);
    if (
      !canOfferShift({
        shiftDate: shift.shift_date,
        todayIso: todayIso(),
        hasActiveRequest: active,
      })
    ) {
      if (active) throw new Error("Für diese Schicht läuft bereits eine Anfrage.");
      throw new Error("Nur zukünftige Schichten (ab morgen) können angeboten werden.");
    }
    await assertShiftDateUnlocked(supabaseAdmin, caller.organizationId, shift.shift_date);

    const { data: inserted, error } = await supabaseAdmin
      .from("shift_swap_requests")
      .insert({
        organization_id: caller.organizationId,
        shift_id: shift.id,
        requester_staff_id: caller.staffId,
        note: data.note ?? null,
        status: "open",
      })
      .select("id")
      .single();
    if (error) {
      // Partieller Unique-Index kann bei Race greifen — freundliche Meldung.
      throw new Error(`Anfrage konnte nicht erstellt werden: ${error.message}`);
    }
    await writeAuditLog({
      organizationId: caller.organizationId,
      actorUserId: caller.userId,
      actorStaffId: caller.staffId,
      action: "swap.request_created",
      entity: "shift_swap_request",
      entityId: inserted.id,
      meta: { shiftId: shift.id, shiftDate: shift.shift_date },
    });
    return { id: inserted.id as string };
  });

// ---------------------------------------------------------------------------
// cancelSwapRequest
// ---------------------------------------------------------------------------

export const cancelSwapRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ requestId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadStaffCaller(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: req, error } = await supabaseAdmin
      .from("shift_swap_requests")
      .select("id, requester_staff_id, status, organization_id")
      .eq("id", data.requestId)
      .eq("organization_id", caller.organizationId)
      .maybeSingle();
    if (error) throw error;
    if (!req) throw new Error("Anfrage nicht gefunden.");
    if (req.requester_staff_id !== caller.staffId) {
      throw new Error("Nur eigene Anfragen können storniert werden.");
    }
    if (req.status !== "open" && req.status !== "peer_accepted") {
      throw new Error("Diese Anfrage kann nicht mehr storniert werden.");
    }
    const { error: updErr } = await supabaseAdmin
      .from("shift_swap_requests")
      .update({ status: "cancelled" })
      .eq("id", req.id);
    if (updErr) throw updErr;
    await writeAuditLog({
      organizationId: caller.organizationId,
      actorUserId: caller.userId,
      actorStaffId: caller.staffId,
      action: "swap.request_cancelled",
      entity: "shift_swap_request",
      entityId: req.id,
    });
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// listMySwapRequests
// ---------------------------------------------------------------------------

export type MySwapRequestRow = {
  id: string;
  shiftId: string;
  shiftDate: string;
  locationName: string;
  area: SwapArea;
  status: "open" | "peer_accepted" | "approved" | "rejected" | "cancelled";
  note: string | null;
  peerStaffName: string | null;
  declineCount: number;
  eligibleCount: number;
  createdAt: string;
};

export const listMySwapRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MySwapRequestRow[]> => {
    const caller = await loadStaffCaller(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: reqs, error } = await supabaseAdmin
      .from("shift_swap_requests")
      .select(
        "id, shift_id, status, note, created_at, peer_staff_id, roster_shifts:roster_shifts!shift_swap_requests_shift_id_fkey(id, staff_id, shift_date, area, location_id, locations(name)), peer:staff!shift_swap_requests_peer_staff_id_fkey(display_name)",
      )
      .eq("organization_id", caller.organizationId)
      .eq("requester_staff_id", caller.staffId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const rows = (reqs ?? []) as Array<{
      id: string;
      shift_id: string;
      status: MySwapRequestRow["status"];
      note: string | null;
      created_at: string;
      peer_staff_id: string | null;
      roster_shifts: {
        id: string;
        staff_id: string;
        shift_date: string;
        area: SwapArea;
        location_id: string;
        locations: { name: string } | null;
      } | null;
      peer: { display_name: string } | null;
    }>;

    const out: MySwapRequestRow[] = [];
    for (const r of rows) {
      const rs = r.roster_shifts;
      if (!rs) continue;
      let declineCount = 0;
      let eligibleCount = 0;
      if (r.status === "open" || r.status === "peer_accepted") {
        const { count, error: declineErr } = await supabaseAdmin
          .from("shift_swap_declines")
          .select("staff_id", { head: true, count: "exact" })
          .eq("request_id", r.id);
        if (declineErr) throw declineErr;
        declineCount = count ?? 0;
        const eligibles = await eligiblePeerStaffIds(supabaseAdmin, caller.organizationId, {
          id: rs.id,
          staffId: rs.staff_id,
          locationId: rs.location_id,
          area: rs.area,
          shiftDate: rs.shift_date,
        });
        eligibleCount = eligibles.length;
      }
      out.push({
        id: r.id,
        shiftId: rs.id,
        shiftDate: rs.shift_date,
        locationName: rs.locations?.name ?? "—",
        area: rs.area,
        status: r.status,
        note: r.note,
        peerStaffName: r.peer?.display_name ?? null,
        declineCount,
        eligibleCount,
        createdAt: r.created_at,
      });
    }
    return out;
  });

// ---------------------------------------------------------------------------
// listOpenSwapsForMe
// ---------------------------------------------------------------------------

export type OpenSwapRow = {
  id: string;
  shiftId: string;
  shiftDate: string;
  locationName: string;
  locationId: string;
  area: SwapArea;
  skillLabel: string | null;
  requesterName: string;
  note: string | null;
  createdAt: string;
};

export const listOpenSwapsForMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OpenSwapRow[]> => {
    const caller = await loadStaffCaller(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) Kandidaten: alle offenen Anfragen in der Organisation, die nicht von mir stammen.
    const { data: reqs, error } = await supabaseAdmin
      .from("shift_swap_requests")
      .select(
        "id, shift_id, note, created_at, requester_staff_id, roster_shifts:roster_shifts!shift_swap_requests_shift_id_fkey(id, staff_id, shift_date, area, location_id, locations(name), skills(name)), requester:staff!shift_swap_requests_requester_staff_id_fkey(display_name)",
      )
      .eq("organization_id", caller.organizationId)
      .eq("status", "open")
      .neq("requester_staff_id", caller.staffId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const candidates = (reqs ?? []) as Array<{
      id: string;
      shift_id: string;
      note: string | null;
      created_at: string;
      requester_staff_id: string;
      roster_shifts: {
        id: string;
        staff_id: string;
        shift_date: string;
        area: SwapArea;
        location_id: string;
        locations: { name: string } | null;
        skills: { name: string } | null;
      } | null;
      requester: { display_name: string } | null;
    }>;
    if (candidates.length === 0) return [];

    // 2) Meine Ablehnungen auf einen Schlag.
    const requestIds = candidates.map((r) => r.id);
    const { data: myDeclines, error: declErr } = await supabaseAdmin
      .from("shift_swap_declines")
      .select("request_id")
      .eq("staff_id", caller.staffId)
      .in("request_id", requestIds);
    if (declErr) throw declErr;
    const declined = new Set((myDeclines ?? []).map((r) => r.request_id as string));

    // 3) Berechtigungsprüfung pro Anfrage.
    const out: OpenSwapRow[] = [];
    for (const c of candidates) {
      if (declined.has(c.id)) continue;
      const rs = c.roster_shifts;
      if (!rs) continue;
      const shift: SwapShift = {
        id: rs.id,
        staffId: rs.staff_id,
        locationId: rs.location_id,
        area: rs.area,
        shiftDate: rs.shift_date,
      };
      const peer = await loadPeerForShift(
        supabaseAdmin,
        caller.organizationId,
        caller.staffId,
        shift,
      );
      if (!peer) continue;
      if (!eligiblePeerFilter({ peer, shift })) continue;
      out.push({
        id: c.id,
        shiftId: rs.id,
        shiftDate: rs.shift_date,
        locationName: rs.locations?.name ?? "—",
        locationId: rs.location_id,
        area: rs.area,
        skillLabel: rs.skills?.name ?? null,
        requesterName: c.requester?.display_name ?? "Kollege",
        note: c.note,
        createdAt: c.created_at,
      });
    }
    return out;
  });

// ---------------------------------------------------------------------------
// acceptSwapRequest
// ---------------------------------------------------------------------------

export const acceptSwapRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        requestId: z.string().uuid(),
        counterShiftId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadStaffCaller(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: reqRow, error } = await supabaseAdmin
      .from("shift_swap_requests")
      .select("id, status, shift_id, requester_staff_id, organization_id")
      .eq("id", data.requestId)
      .eq("organization_id", caller.organizationId)
      .maybeSingle();
    if (error) throw error;
    if (!reqRow) throw new Error("Anfrage nicht gefunden.");
    if (reqRow.status !== "open") {
      throw new Error("Diese Anfrage wurde bereits übernommen oder ist geschlossen.");
    }
    if (reqRow.requester_staff_id === caller.staffId) {
      throw new Error("Eigene Anfragen können nicht angenommen werden.");
    }

    // Bereits abgelehnt? → aus dem Spiel.
    const { data: myDecline, error: declErr } = await supabaseAdmin
      .from("shift_swap_declines")
      .select("staff_id")
      .eq("request_id", reqRow.id)
      .eq("staff_id", caller.staffId)
      .maybeSingle();
    if (declErr) throw declErr;
    if (myDecline) {
      throw new Error("Diese Anfrage wurde von dir bereits abgelehnt.");
    }

    const reqShiftRow = await loadShift(supabaseAdmin, caller.organizationId, reqRow.shift_id);
    const reqShift: SwapShift = {
      id: reqShiftRow.id,
      staffId: reqShiftRow.staff_id,
      locationId: reqShiftRow.location_id,
      area: reqShiftRow.area,
      shiftDate: reqShiftRow.shift_date,
    };
    const peer = await loadPeerForShift(
      supabaseAdmin,
      caller.organizationId,
      caller.staffId,
      reqShift,
    );
    if (!peer || !eligiblePeerFilter({ peer, shift: reqShift })) {
      throw new Error("Du bist für diese Anfrage nicht (mehr) berechtigt.");
    }

    let counterShiftId: string | null = null;
    if (data.counterShiftId) {
      const counter = await loadShift(supabaseAdmin, caller.organizationId, data.counterShiftId);
      if (counter.staff_id !== caller.staffId) {
        throw new Error("Gegentausch-Schicht gehört dir nicht.");
      }
      const counterActive = await hasActiveRequestForShift(supabaseAdmin, counter.id);
      const ok = canAcceptCounterShift({
        counterShift: {
          id: counter.id,
          staffId: counter.staff_id,
          locationId: counter.location_id,
          area: counter.area,
          shiftDate: counter.shift_date,
          hasActiveRequest: counterActive,
        },
        requestShift: reqShift,
        peerStaffId: caller.staffId,
        todayIso: todayIso(),
      });
      if (!ok) {
        throw new Error("Diese Gegentausch-Schicht passt nicht (Bereich, Standort oder Datum).");
      }
      counterShiftId = counter.id;
    }

    // Optimistischer Update mit Status-Guard, damit ein zweiter Peer den Race verliert.
    const { data: updated, error: updErr } = await supabaseAdmin
      .from("shift_swap_requests")
      .update({
        status: "peer_accepted",
        peer_staff_id: caller.staffId,
        peer_shift_id: counterShiftId,
        responded_at: new Date().toISOString(),
      })
      .eq("id", reqRow.id)
      .eq("status", "open")
      .select("id")
      .maybeSingle();
    if (updErr) throw updErr;
    if (!updated) {
      throw new Error("Anfrage wurde inzwischen von jemand anderem übernommen.");
    }

    await writeAuditLog({
      organizationId: caller.organizationId,
      actorUserId: caller.userId,
      actorStaffId: caller.staffId,
      action: "swap.peer_accepted",
      entity: "shift_swap_request",
      entityId: reqRow.id,
      meta: { counterShiftId },
    });
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// declineSwapRequest
// ---------------------------------------------------------------------------

export const declineSwapRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ requestId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadStaffCaller(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: reqRow, error } = await supabaseAdmin
      .from("shift_swap_requests")
      .select("id, status, shift_id, requester_staff_id")
      .eq("id", data.requestId)
      .eq("organization_id", caller.organizationId)
      .maybeSingle();
    if (error) throw error;
    if (!reqRow) throw new Error("Anfrage nicht gefunden.");
    if (reqRow.status !== "open") {
      throw new Error("Diese Anfrage ist nicht mehr offen.");
    }
    if (reqRow.requester_staff_id === caller.staffId) {
      throw new Error("Eigene Anfragen können nicht abgelehnt werden.");
    }

    const reqShiftRow = await loadShift(supabaseAdmin, caller.organizationId, reqRow.shift_id);
    const shift: SwapShift = {
      id: reqShiftRow.id,
      staffId: reqShiftRow.staff_id,
      locationId: reqShiftRow.location_id,
      area: reqShiftRow.area,
      shiftDate: reqShiftRow.shift_date,
    };
    const peer = await loadPeerForShift(
      supabaseAdmin,
      caller.organizationId,
      caller.staffId,
      shift,
    );
    if (!peer || !eligiblePeerFilter({ peer, shift })) {
      throw new Error("Du bist für diese Anfrage nicht berechtigt.");
    }

    const { error: insErr } = await supabaseAdmin.from("shift_swap_declines").upsert(
      {
        request_id: reqRow.id,
        staff_id: caller.staffId,
      },
      { onConflict: "request_id,staff_id", ignoreDuplicates: true },
    );
    if (insErr) throw insErr;

    await writeAuditLog({
      organizationId: caller.organizationId,
      actorUserId: caller.userId,
      actorStaffId: caller.staffId,
      action: "swap.peer_declined",
      entity: "shift_swap_request",
      entityId: reqRow.id,
    });
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// myCandidateCounterShifts — Vorschlags-Liste für Gegentausch beim Annehmen
// ---------------------------------------------------------------------------

export type CandidateCounterShift = {
  id: string;
  shiftDate: string;
};

export const listMyCandidateCounterShifts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        locationId: z.string().uuid(),
        area: z.enum(["kitchen", "service", "gl"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<CandidateCounterShift[]> => {
    const caller = await loadStaffCaller(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const today = todayIso();
    const { data: rows, error } = await supabaseAdmin
      .from("roster_shifts")
      .select("id, shift_date")
      .eq("organization_id", caller.organizationId)
      .eq("staff_id", caller.staffId)
      .eq("location_id", data.locationId)
      .eq("area", data.area)
      .gt("shift_date", today)
      .order("shift_date", { ascending: true });
    if (error) throw error;
    const candidates = (rows ?? []) as Array<{ id: string; shift_date: string }>;
    if (candidates.length === 0) return [];
    const ids = candidates.map((r) => r.id);
    const { data: active, error: aErr } = await supabaseAdmin
      .from("shift_swap_requests")
      .select("shift_id")
      .in("shift_id", ids)
      .in("status", ["open", "peer_accepted"]);
    if (aErr) throw aErr;
    const blocked = new Set((active ?? []).map((r) => r.shift_id as string));
    return candidates
      .filter((r) => !blocked.has(r.id))
      .map((r) => ({ id: r.id, shiftDate: r.shift_date }));
  });