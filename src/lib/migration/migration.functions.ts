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
import { createHash } from "node:crypto";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { writeAuditLog } from "@/lib/admin/audit";
import { loadTimeLock } from "@/lib/time/time-lock";
import { parseBunkerCsv } from "./parse-bunker";
import { parseTagesabrechnungCsv } from "./parse-tagesabrechnung";
import { importKeyOf, localTimesOf, sundayHolidayOf } from "./derivations";
import { reconcile } from "./reconcile";
import type { NormalizedShift, SkipReason, SourceSystem } from "./normalize";

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

type Counters = {
  read: number;
  imported: number;
  skippedByReason: Record<SkipReason, number>;
};

function emptyCounters(): Counters {
  return {
    read: 0,
    imported: 0,
    skippedByReason: { absence: 0, invalid_time: 0, unmapped_staff: 0, duplicate: 0 },
  };
}

function parseCsv(sourceSystem: SourceSystem, csvText: string): NormalizedShift[] {
  return sourceSystem === "bunker" ? parseBunkerCsv(csvText) : parseTagesabrechnungCsv(csvText);
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

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
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let curr = i;
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + cost);
      prev[j - 1] = curr === undefined ? prev[j - 1] : prev[j - 1];
      prev[j] = curr;
      diag = tmp;
    }
  }
  return prev[b.length];
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
    const shifts = parseCsv(data.sourceSystem, data.csvText);
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

    const shifts = parseCsv(data.sourceSystem, data.csvText);
    const fileHash = sha256(data.csvText);
    const counters = emptyCounters();
    counters.read = shifts.length;

    // 1) Bestätigte Identity-Map laden.
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

    // 2) Vorhandene import_keys laden (Idempotenz-Check vor INSERT).
    const { data: existingRows, error: exErr } = await supabaseAdmin
      .from("time_entries")
      .select("import_key")
      .eq("organization_id", caller.organizationId)
      .eq("source", "import")
      .not("import_key", "is", null);
    if (exErr) throw exErr;
    const existingKeys = new Set<string>();
    for (const r of existingRows ?? []) if (r.import_key) existingKeys.add(r.import_key);

    // 3) Zeilen klassifizieren.
    type Insertable = {
      organization_id: string;
      staff_id: string;
      started_at: string;
      ended_at: string;
      business_date: string;
      break_minutes: number;
      source: "import";
      import_key: string;
    };
    const inserts: Insertable[] = [];
    let maxBusinessDate: string | null = null;

    for (const s of shifts) {
      if (s.skipReason !== null) {
        counters.skippedByReason[s.skipReason]++;
        continue;
      }
      const altKey = s.altEmployeeId || s.altEmployeeName;
      const staffId = altKey ? mapByAltId.get(altKey) ?? null : null;
      if (!staffId) {
        counters.skippedByReason.unmapped_staff++;
        continue;
      }
      const importKey = importKeyOf(s);
      if (existingKeys.has(importKey)) {
        counters.skippedByReason.duplicate++;
        continue;
      }
      if (!s.startedAt || !s.endedAt) {
        counters.skippedByReason.invalid_time++;
        continue;
      }
      inserts.push({
        organization_id: caller.organizationId,
        staff_id: staffId,
        started_at: s.startedAt,
        ended_at: s.endedAt,
        business_date: s.shiftDate,
        break_minutes: s.breakMinutes,
        source: "import",
        import_key: importKey,
      });
      if (!maxBusinessDate || s.shiftDate > maxBusinessDate) maxBusinessDate = s.shiftDate;
    }

    if (data.mode === "dry_run") {
      counters.imported = inserts.length; // potenziell — kein Schreibvorgang
      return { mode: data.mode, fileHash, counters, runId: null, lockedThrough: null };
    }

    // 4) Commit-Modus: import_runs anlegen, batchweise inserten, audit + lock.
    const { data: runRow, error: runErr } = await supabaseAdmin
      .from("import_runs")
      .insert({
        organization_id: caller.organizationId,
        source_system: data.sourceSystem,
        file_hash: fileHash,
        mode: data.mode,
        counters: counters as unknown as Json,
        created_by: caller.userId,
      })
      .select("id")
      .single();
    if (runErr || !runRow) throw runErr ?? new Error("import_runs insert failed");
    const runId = runRow.id;

    if (inserts.length > 0) {
      const CHUNK = 500;
      for (let i = 0; i < inserts.length; i += CHUNK) {
        const slice = inserts.slice(i, i + CHUNK);
        const { error } = await supabaseAdmin.from("time_entries").insert(slice);
        if (error) throw error;
      }
    }
    counters.imported = inserts.length;

    await supabaseAdmin
      .from("import_runs")
      .update({
        finished_at: new Date().toISOString(),
        counters: counters as unknown as Json,
      })
      .eq("id", runId);

    await writeAuditLog({
      organizationId: caller.organizationId,
      actorUserId: caller.userId,
      actorStaffId: caller.staffId,
      action: "time_entries.import",
      entity: "import_runs",
      entityId: runId,
      meta: { sourceSystem: data.sourceSystem, fileHash, counters },
    });

    // 5) Wasserlinie auf max(business_date) setzen, aber nur vorwärts.
    let newLock: string | null = null;
    if (maxBusinessDate) {
      const before = await loadTimeLock(supabaseAdmin, caller.organizationId);
      if (!before || maxBusinessDate > before) {
        const { error: lockErr } = await supabaseAdmin
          .from("organization_settings")
          .upsert(
            {
              organization_id: caller.organizationId,
              time_locked_through_date: maxBusinessDate,
            },
            { onConflict: "organization_id" },
          );
        if (lockErr) throw lockErr;
        newLock = maxBusinessDate;
        await writeAuditLog({
          organizationId: caller.organizationId,
          actorUserId: caller.userId,
          actorStaffId: caller.staffId,
          action: "settings.time_lock_moved",
          entity: "organization_settings",
          entityId: caller.organizationId,
          meta: { before, after: maxBusinessDate, reason: "import_commit", runId },
        });
      }
    }

    return { mode: data.mode, fileHash, counters, runId, lockedThrough: newLock };
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