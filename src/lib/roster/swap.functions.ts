// TA1 — Server-Functions Schichttausch.
//
// Sicherheit:
//  - Identität IMMER aus context.userId (auth.uid via requireSupabaseAuth) —
//    NIE aus dem Client-Payload.
//  - shift_swap_requests hat KEINE Client-RLS-Policies (DENY-ALL).
//    Alle Zugriffe laufen ausschließlich hier über supabaseAdmin.
//  - Doppel-Anfrage-Schutz doppelt: server-seitige Vor-Prüfung UND
//    partieller Unique-Index (shift_swap_requests_active_shift).
//  - acceptSwapRequest ändert KEINE roster_shifts (Vollzug ist TA2).
//  - Anfragen in gesperrte Perioden werden abgewiesen.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { loadStaffCaller } from "@/lib/time/time.functions";
import { writeAuditLog } from "@/lib/admin/audit";
import {
  canOfferShift,
  canAcceptCounterShift,
  eligiblePeerFilter,
  type SwapArea,
  type SwapShiftShape,
} from "./swap-rules";

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
  if (data?.status === "locked") {
    throw new Error("Periode ist gesperrt.");
  }
}

type SwapStatus = "open" | "peer_accepted" | "approved" | "rejected" | "cancelled";

export type MySwapRequestRow = {
  id: string;
  shiftId: string;
  shiftDate: string;
  locationName: string;
  area: SwapArea;
  status: SwapStatus;
  peerName: string | null;
  peerShiftDate: string | null;
  note: string | null;
  createdAt: string;
  respondedAt: string | null;
  decidedAt: string | null;
};

export type OpenSwapForMeRow = {
  id: string;
  shiftId: string;
  shiftDate: string;
  locationId: string;
  locationName: string;
  area: SwapArea;
  skillName: string | null;
  requesterName: string;
  note: string | null;
  createdAt: string;
};

export type MySwappableShiftRow = {
  shiftId: string;
  shiftDate: string;
  locationName: string;
  area: SwapArea;
  hasActiveRequest: boolean;
  swapStatus: SwapStatus | null;
};

// =========================================================================
// createSwapRequest
// =========================================================================
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

    const { data: shift, error: shiftErr } = await supabaseAdmin
      .from("roster_shifts")
      .select("id, staff_id, organization_id, shift_date, location_id, area")
      .eq("id", data.shiftId)
      .maybeSingle();
    if (shiftErr) throw shiftErr;
    if (!shift || shift.organization_id !== caller.organizationId) {
      throw new Error("Schicht nicht gefunden.");
    }
    if (shift.staff_id !== caller.staffId) {
      throw new Error("Nur eigene Schichten können zum Tausch angeboten werden.");
    }

    // Aktive Anfrage vorhanden?
    const { data: active, error: activeErr } = await supabaseAdmin
      .from("shift_swap_requests")
      .select("id")
      .eq("shift_id", data.shiftId)
      .in("status", ["open", "peer_accepted"])
      .maybeSingle();
    if (activeErr) throw activeErr;

    const rule = canOfferShift({
      shiftDate: shift.shift_date as string,
      todayIso: todayIso(),
      hasActiveRequest: !!active,
    });
    if (!rule.ok) throw new Error(rule.reason);

    await assertShiftDateUnlocked(supabaseAdmin, caller.organizationId, shift.shift_date as string);

    const noteTrim = data.note?.trim();
    const { data: row, error } = await supabaseAdmin
      .from("shift_swap_requests")
      .insert({
        organization_id: caller.organizationId,
        shift_id: shift.id as string,
        requester_staff_id: caller.staffId,
        status: "open",
        note: noteTrim && noteTrim.length > 0 ? noteTrim : null,
      })
      .select("id")
      .single();
    if (error) {
      // Partieller Unique-Index: 23505 = doppelte aktive Anfrage.
      if ((error as { code?: string }).code === "23505") {
        throw new Error("Für diese Schicht existiert bereits eine aktive Anfrage.");
      }
      throw error;
    }

    await writeAuditLog({
      organizationId: caller.organizationId,
      actorUserId: context.userId,
      actorStaffId: caller.staffId,
      action: "swap.request_created",
      entity: "shift_swap_request",
      entityId: row.id as string,
      meta: {
        shiftId: shift.id,
        shiftDate: shift.shift_date,
        area: shift.area,
      },
    });

    return { id: row.id as string };
  });

// =========================================================================
// cancelSwapRequest
// =========================================================================
export const cancelSwapRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ requestId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadStaffCaller(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: snap, error: snapErr } = await supabaseAdmin
      .from("shift_swap_requests")
      .select("id, organization_id, requester_staff_id, status, shift_id")
      .eq("id", data.requestId)
      .maybeSingle();
    if (snapErr) throw snapErr;
    if (!snap || snap.organization_id !== caller.organizationId) {
      throw new Error("Anfrage nicht gefunden.");
    }
    if (snap.requester_staff_id !== caller.staffId) {
      throw new Error("Nur der Anfragende kann stornieren.");
    }
    if (snap.status !== "open" && snap.status !== "peer_accepted") {
      throw new Error("Anfrage kann nicht mehr storniert werden.");
    }

    const { error: updErr } = await supabaseAdmin
      .from("shift_swap_requests")
      .update({ status: "cancelled", decided_at: new Date().toISOString() })
      .eq("id", data.requestId);
    if (updErr) throw updErr;

    await writeAuditLog({
      organizationId: caller.organizationId,
      actorUserId: context.userId,
      actorStaffId: caller.staffId,
      action: "swap.request_cancelled",
      entity: "shift_swap_request",
      entityId: data.requestId,
      meta: { previousStatus: snap.status, shiftId: snap.shift_id },
    });

    return { ok: true as const };
  });

// =========================================================================
// listMySwapRequests
// =========================================================================
export const listMySwapRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MySwapRequestRow[]> => {
    const caller = await loadStaffCaller(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("shift_swap_requests")
      .select(
        `id, status, note, created_at, responded_at, decided_at,
         shift_id, peer_shift_id,
         shift:roster_shifts!shift_swap_requests_shift_id_fkey(shift_date, area, locations(name)),
         peer_shift:roster_shifts!shift_swap_requests_peer_shift_id_fkey(shift_date),
         peer:staff!shift_swap_requests_peer_staff_id_fkey(display_name)`,
      )
      .eq("organization_id", caller.organizationId)
      .eq("requester_staff_id", caller.staffId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    return (rows ?? []).map((r) => {
      const shift = r.shift as {
        shift_date: string;
        area: SwapArea;
        locations: { name: string } | null;
      } | null;
      const peerShift = r.peer_shift as { shift_date: string } | null;
      const peer = r.peer as { display_name: string } | null;
      return {
        id: r.id as string,
        shiftId: r.shift_id as string,
        shiftDate: shift?.shift_date ?? "",
        locationName: shift?.locations?.name ?? "—",
        area: (shift?.area ?? "service") as SwapArea,
        status: r.status as SwapStatus,
        peerName: peer?.display_name ?? null,
        peerShiftDate: peerShift?.shift_date ?? null,
        note: (r.note as string | null) ?? null,
        createdAt: r.created_at as string,
        respondedAt: (r.responded_at as string | null) ?? null,
        decidedAt: (r.decided_at as string | null) ?? null,
      };
    });
  });

// =========================================================================
// listOpenSwapsForMe — offene Anfragen berechtigter Kollegen
// =========================================================================
export const listOpenSwapsForMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OpenSwapForMeRow[]> => {
    const caller = await loadStaffCaller(context.supabase, context.userId);
    if (!caller.isActive) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Eigene Standort/Bereich-Scopes.
    const { data: myScopes, error: scopesErr } = await supabaseAdmin
      .from("staff_locations")
      .select("location_id, department")
      .eq("staff_id", caller.staffId)
      .eq("organization_id", caller.organizationId);
    if (scopesErr) throw scopesErr;
    const scopes = (myScopes ?? []).map((s) => ({
      locationId: s.location_id as string,
      area: s.department as SwapArea,
    }));
    if (scopes.length === 0) return [];

    // Offene Anfragen der Organisation (ohne eigene) im Zukunft-Fenster.
    const { data: rows, error } = await supabaseAdmin
      .from("shift_swap_requests")
      .select(
        `id, note, created_at, shift_id,
         shift:roster_shifts!shift_swap_requests_shift_id_fkey(
           id, shift_date, area, location_id, locations(name), skills(name)
         ),
         requester:staff!shift_swap_requests_requester_staff_id_fkey(display_name)`,
      )
      .eq("organization_id", caller.organizationId)
      .eq("status", "open")
      .neq("requester_staff_id", caller.staffId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const today = todayIso();

    // Für jede Kandidaten-Schicht: eigene Schichten am selben Datum laden
    // (Tages-Konflikt-Prüfung). Bewusst pro Datum gesammelt.
    const dates = new Set<string>();
    for (const r of rows ?? []) {
      const shift = r.shift as { shift_date: string } | null;
      if (shift?.shift_date) dates.add(shift.shift_date);
    }
    const myShiftsOnDate = new Map<string, { locationId: string; area: SwapArea }[]>();
    if (dates.size > 0) {
      const { data: myShifts, error: myShiftsErr } = await supabaseAdmin
        .from("roster_shifts")
        .select("shift_date, location_id, area")
        .eq("organization_id", caller.organizationId)
        .eq("staff_id", caller.staffId)
        .in("shift_date", Array.from(dates));
      if (myShiftsErr) throw myShiftsErr;
      for (const s of myShifts ?? []) {
        const list = myShiftsOnDate.get(s.shift_date as string) ?? [];
        list.push({ locationId: s.location_id as string, area: s.area as SwapArea });
        myShiftsOnDate.set(s.shift_date as string, list);
      }
    }

    const result: OpenSwapForMeRow[] = [];
    for (const r of rows ?? []) {
      const shift = r.shift as {
        id: string;
        shift_date: string;
        area: SwapArea;
        location_id: string;
        locations: { name: string } | null;
        skills: { name: string } | null;
      } | null;
      if (!shift) continue;
      // Nur zukünftige Schichten anbieten.
      if (!(shift.shift_date > today)) continue;

      const peerShape = {
        staffId: caller.staffId,
        isActive: true,
        locations: scopes,
        shiftsOnDate: myShiftsOnDate.get(shift.shift_date) ?? [],
      };
      const shiftShape: SwapShiftShape = {
        id: shift.id,
        staffId: "", // requester-staffId nicht nötig, wir haben oben schon neq gefiltert
        locationId: shift.location_id,
        area: shift.area,
        shiftDate: shift.shift_date,
      };
      if (!eligiblePeerFilter({ peer: peerShape, shift: shiftShape })) continue;

      const requester = r.requester as { display_name: string } | null;
      result.push({
        id: r.id as string,
        shiftId: shift.id,
        shiftDate: shift.shift_date,
        locationId: shift.location_id,
        locationName: shift.locations?.name ?? "—",
        area: shift.area,
        skillName: shift.skills?.name ?? null,
        requesterName: requester?.display_name ?? "—",
        note: (r.note as string | null) ?? null,
        createdAt: r.created_at as string,
      });
    }
    return result;
  });

// =========================================================================
// getMySwappableShifts — eigene Schichten mit Swap-Status (für /zeit/schichten)
// =========================================================================
export const getMySwappableShifts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<MySwappableShiftRow[]> => {
    const caller = await loadStaffCaller(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: shifts, error } = await supabaseAdmin
      .from("roster_shifts")
      .select("id, shift_date, area, locations(name)")
      .eq("organization_id", caller.organizationId)
      .eq("staff_id", caller.staffId)
      .gte("shift_date", data.from)
      .lte("shift_date", data.to)
      .order("shift_date", { ascending: true });
    if (error) throw error;

    const ids = (shifts ?? []).map((s) => s.id as string);
    const swapByShift = new Map<string, SwapStatus>();
    if (ids.length > 0) {
      const { data: swaps, error: swapErr } = await supabaseAdmin
        .from("shift_swap_requests")
        .select("shift_id, status")
        .in("shift_id", ids)
        .in("status", ["open", "peer_accepted"]);
      if (swapErr) throw swapErr;
      for (const s of swaps ?? []) {
        swapByShift.set(s.shift_id as string, s.status as SwapStatus);
      }
    }

    return (shifts ?? []).map((s) => {
      const st = swapByShift.get(s.id as string) ?? null;
      return {
        shiftId: s.id as string,
        shiftDate: s.shift_date as string,
        locationName: (s.locations as { name: string } | null)?.name ?? "—",
        area: s.area as SwapArea,
        hasActiveRequest: st !== null,
        swapStatus: st,
      };
    });
  });

// =========================================================================
// acceptSwapRequest — KEINE Änderung an roster_shifts (Vollzug in TA2)
// =========================================================================
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
    if (!caller.isActive) throw new Error("Kein aktiver Mitarbeiter.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: req, error: reqErr } = await supabaseAdmin
      .from("shift_swap_requests")
      .select(
        `id, organization_id, status, shift_id, requester_staff_id,
         shift:roster_shifts!shift_swap_requests_shift_id_fkey(
           id, staff_id, shift_date, area, location_id, organization_id
         )`,
      )
      .eq("id", data.requestId)
      .maybeSingle();
    if (reqErr) throw reqErr;
    if (!req || req.organization_id !== caller.organizationId) {
      throw new Error("Anfrage nicht gefunden.");
    }
    if (req.status !== "open") {
      throw new Error("Anfrage ist nicht mehr offen.");
    }
    if (req.requester_staff_id === caller.staffId) {
      throw new Error("Eigene Anfrage kann nicht übernommen werden.");
    }
    const shift = req.shift as {
      id: string;
      staff_id: string;
      shift_date: string;
      area: SwapArea;
      location_id: string;
      organization_id: string;
    } | null;
    if (!shift) throw new Error("Zugehörige Schicht nicht gefunden.");

    // Berechtigung erneut prüfen (defense in depth).
    const { data: myScopes, error: scErr } = await supabaseAdmin
      .from("staff_locations")
      .select("location_id, department")
      .eq("staff_id", caller.staffId)
      .eq("organization_id", caller.organizationId);
    if (scErr) throw scErr;

    const { data: mySame, error: msErr } = await supabaseAdmin
      .from("roster_shifts")
      .select("location_id, area")
      .eq("organization_id", caller.organizationId)
      .eq("staff_id", caller.staffId)
      .eq("shift_date", shift.shift_date);
    if (msErr) throw msErr;

    const eligible = eligiblePeerFilter({
      peer: {
        staffId: caller.staffId,
        isActive: true,
        locations: (myScopes ?? []).map((s) => ({
          locationId: s.location_id as string,
          area: s.department as SwapArea,
        })),
        shiftsOnDate: (mySame ?? []).map((s) => ({
          locationId: s.location_id as string,
          area: s.area as SwapArea,
        })),
      },
      shift: {
        id: shift.id,
        staffId: shift.staff_id,
        locationId: shift.location_id,
        area: shift.area,
        shiftDate: shift.shift_date,
      },
    });
    if (!eligible) throw new Error("Du bist für diese Anfrage nicht berechtigt.");

    // Optionaler Gegentausch: Regeln prüfen.
    let counterShiftId: string | null = null;
    if (data.counterShiftId) {
      const { data: cs, error: csErr } = await supabaseAdmin
        .from("roster_shifts")
        .select("id, staff_id, shift_date, area, location_id, organization_id")
        .eq("id", data.counterShiftId)
        .maybeSingle();
      if (csErr) throw csErr;
      if (!cs || cs.organization_id !== caller.organizationId) {
        throw new Error("Gegentausch-Schicht nicht gefunden.");
      }
      const { data: csActive, error: csaErr } = await supabaseAdmin
        .from("shift_swap_requests")
        .select("id")
        .eq("shift_id", cs.id as string)
        .in("status", ["open", "peer_accepted"])
        .maybeSingle();
      if (csaErr) throw csaErr;
      const csRule = canAcceptCounterShift({
        counterShift: {
          id: cs.id as string,
          staffId: cs.staff_id as string,
          locationId: cs.location_id as string,
          area: cs.area as SwapArea,
          shiftDate: cs.shift_date as string,
        },
        requestShift: {
          id: shift.id,
          staffId: shift.staff_id,
          locationId: shift.location_id,
          area: shift.area,
          shiftDate: shift.shift_date,
        },
        peerStaffId: caller.staffId,
        todayIso: todayIso(),
        counterHasActiveRequest: !!csActive,
      });
      if (!csRule.ok) throw new Error(csRule.reason);
      counterShiftId = cs.id as string;
    }

    const { error: updErr } = await supabaseAdmin
      .from("shift_swap_requests")
      .update({
        peer_staff_id: caller.staffId,
        peer_shift_id: counterShiftId,
        status: "peer_accepted",
        responded_at: new Date().toISOString(),
      })
      .eq("id", data.requestId)
      .eq("status", "open"); // race-guard
    if (updErr) throw updErr;

    await writeAuditLog({
      organizationId: caller.organizationId,
      actorUserId: context.userId,
      actorStaffId: caller.staffId,
      action: "swap.peer_accepted",
      entity: "shift_swap_request",
      entityId: data.requestId,
      meta: {
        shiftId: shift.id,
        counterShiftId,
        requesterStaffId: req.requester_staff_id,
      },
    });

    return { ok: true as const };
  });
