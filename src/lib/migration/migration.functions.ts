// B2c — Server-Functions für Migration & Parallelbetrieb.
//
// Architektur:
//   * Alle Funktionen sind Admin-only (loadAdminCaller(..., 'admin')).
//   * Schreibvorgänge laufen via supabaseAdmin (RLS auf time_entries / import_runs /
//     staff_identity_map ist DENY-ALL für authenticated; nur service_role schreibt).
//   * runImport mit mode='dry_run' macht KEINE DB-Mutationen (kein import_runs-Insert,
//     kein time_entries-Insert, kein audit_log).
//   * runImport mit mode='commit' ist idempotent: existierende import_keys werden
//     vor INSERT herausgefiltert; der unique partial index
//     (organization_id, import_key) WHERE source='import' AND import_key IS NOT NULL
//     ist die letzte Verteidigungslinie.
//   * Nach erfolgreichem commit-Lauf: time_locked_through_date = max(business_date)
//     wird gesetzt (separater audit_log-Eintrag via setTimeLock-Pfad — hier inline).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { localTimesOf, sundayHolidayOf } from "./derivations";
import { reconcile } from "./reconcile";
import { emptyCounters, executeImport, parseCsvFor } from "./run-import-core";

// =========================================================================
// Eingabe-Schemata
// =========================================================================

const sourceSystemSchema = z.enum(["tagesabrechnung", "bunker"]);

const parseInputSchema = z.object({
  sourceSystem: sourceSystemSchema,
  csvText: z.string().min(1),
});

const runImportInputSchema = z.object({
  sourceSystem: sourceSystemSchema,
  csvText: z.string().min(1),
  mode: z.enum(["dry_run", "commit"]),
});

const confirmMappingInputSchema = z.object({
  id: z.string().uuid(),
  staffId: z.string().uuid().nullable(),
});

const reconcileInputSchema = z.object({
  sourceSystem: sourceSystemSchema,
  csvText: z.string().min(1),
  groupBy: z.enum(["week", "cycle"]),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// =========================================================================
// Hilfen
// =========================================================================

/** Normalisiert Namen für Levenshtein-Match: lower, ohne Diakritika und Sonderzeichen. */
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const prev = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    let prevDiag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = prev[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, prevDiag + cost);
      prevDiag = tmp;
    }
  }
  return prev[n];
}

/** Schwelle: <= 2 oder Distanz / max(len) <= 0.2 — bewusst eng, lieber „kein Vorschlag". */
function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const d = levenshtein(na, nb);
  if (d <= 2) return true;
  return d / Math.max(na.length, nb.length) <= 0.2;
}

// =========================================================================
// Server-Functions
// =========================================================================

/** Dry-Vorschau: parsed CSV, gibt Zähler + Top-50 zurück. KEIN DB-Schreibvorgang. */
export const parseImportCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => parseInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await loadAdminCaller(context.supabase, context.userId, "admin");
    const shifts = parseCsvFor(data.sourceSystem, data.csvText);
    const counters = emptyCounters();
    counters.read = shifts.length;
    for (const s of shifts) {
      if (s.skipReason !== null) counters.skippedByReason[s.skipReason]++;
    }
    return {
      counters,
      sample: shifts.slice(0, 50).map((s) => ({
        altId: s.altId,
        altEmployeeId: s.altEmployeeId,
        altEmployeeName: s.altEmployeeName,
        shiftDate: s.shiftDate,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        skipReason: s.skipReason,
      })),
    };
  });

/** Distinkte (alt_id, alt_name) extrahieren, Namens-Match gegen public.staff,
 *  Vorschläge als unbestätigte staff_identity_map-Zeilen anlegen (upsert). */
export const proposeIdentityMappings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => parseInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const shifts = parseCsv(data.sourceSystem, data.csvText);
    const distinct = new Map<string, { altId: string; altName: string }>();
    for (const s of shifts) {
      const altId = s.altEmployeeId || s.altEmployeeName;
      if (!altId) continue;
      if (!distinct.has(altId)) distinct.set(altId, { altId, altName: s.altEmployeeName });
    }

    const { data: staffRows, error: staffErr } = await supabaseAdmin
      .from("staff")
      .select("id, display_name, first_name, last_name")
      .eq("organization_id", caller.organizationId)
      .eq("is_active", true);
    if (staffErr) throw staffErr;

    const proposals: {
      altId: string;
      altName: string;
      proposedStaffId: string | null;
      proposedDisplayName: string | null;
    }[] = [];

    for (const d of distinct.values()) {
      let match: { id: string; display_name: string } | null = null;
      for (const st of staffRows ?? []) {
        const full = `${st.first_name ?? ""} ${st.last_name ?? ""}`.trim();
        if (namesMatch(d.altName, st.display_name) || (full && namesMatch(d.altName, full))) {
          match = { id: st.id, display_name: st.display_name };
          break;
        }
      }
      proposals.push({
        altId: d.altId,
        altName: d.altName,
        proposedStaffId: match?.id ?? null,
        proposedDisplayName: match?.display_name ?? null,
      });
    }

    // Unbestätigte Vorschläge persistieren (upsert auf unique key
    // (organization_id, source_system, alt_id)). Bestätigte Zeilen NIE
    // überschreiben — dafür: nur upsert, wenn confirmed_at IS NULL.
    for (const p of proposals) {
      const { data: existing } = await supabaseAdmin
        .from("staff_identity_map")
        .select("id, confirmed_at")
        .eq("organization_id", caller.organizationId)
        .eq("source_system", data.sourceSystem)
        .eq("alt_id", p.altId)
        .maybeSingle();
      if (existing?.confirmed_at) continue; // bestätigte Mappings nicht anfassen
      if (existing) {
        await supabaseAdmin
          .from("staff_identity_map")
          .update({ alt_name: p.altName, staff_id: p.proposedStaffId })
          .eq("id", existing.id);
      } else {
        await supabaseAdmin.from("staff_identity_map").insert({
          organization_id: caller.organizationId,
          source_system: data.sourceSystem,
          alt_id: p.altId,
          alt_name: p.altName,
          staff_id: p.proposedStaffId,
        });
      }
    }

    return { proposals };
  });

/** Mapping bestätigen (staff_id setzen) oder bewusst überspringen (null). */
export const confirmMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => confirmMappingInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("staff_identity_map")
      .update({
        staff_id: data.staffId,
        confirmed_at: new Date().toISOString(),
        confirmed_by: caller.userId,
      })
      .eq("id", data.id)
      .eq("organization_id", caller.organizationId);
    if (error) throw error;
    return { ok: true as const };
  });

/** Listet Identity-Mappings für die UI. */
export const listIdentityMappings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ sourceSystem: sourceSystemSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("staff_identity_map")
      .select("id, alt_id, alt_name, staff_id, confirmed_at, confirmed_by")
      .eq("organization_id", caller.organizationId)
      .eq("source_system", data.sourceSystem)
      .order("alt_name", { ascending: true });
    if (error) throw error;
    return { mappings: rows ?? [] };
  });

/**
 * Importiert Alt-Schichten in time_entries (source='import').
 * dry_run zählt nur; commit schreibt + setzt Wasserlinie auf max(business_date).
 */
export const runImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => runImportInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return executeImport({
      admin: supabaseAdmin,
      organizationId: caller.organizationId,
      actorUserId: caller.userId,
      actorStaffId: caller.staffId,
      sourceSystem: data.sourceSystem,
      csvText: data.csvText,
      mode: data.mode,
    });
  });

/** Abgleichsbericht: Alt-Topf vs. neu via tagesabrechnung-Adapter berechnet. */
export const getReconciliationReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => reconcileInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const shifts = parseCsv(data.sourceSystem, data.csvText).filter((s) => {
      if (data.from && s.shiftDate < data.from) return false;
      if (data.to && s.shiftDate > data.to) return false;
      return true;
    });

    const { data: mapRows, error: mapErr } = await supabaseAdmin
      .from("staff_identity_map")
      .select("alt_id, staff_id, confirmed_at")
      .eq("organization_id", caller.organizationId)
      .eq("source_system", data.sourceSystem);
    if (mapErr) throw mapErr;
    const mapByAltId = new Map<string, string | null>();
    for (const m of mapRows ?? []) {
      if (m.confirmed_at) mapByAltId.set(m.alt_id, m.staff_id);
    }

    const rows = reconcile({
      shifts,
      staffIdOf: (s) => mapByAltId.get(s.altEmployeeId || s.altEmployeeName) ?? null,
      sundayHolidayOf,
      localTimes: localTimesOf,
      groupBy: data.groupBy,
    });

    return { rows };
  });