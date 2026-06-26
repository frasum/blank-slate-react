// Kern-Logik des Imports — ohne Auth/Middleware. Wird sowohl von der
// Server-Function `runImport` als auch von DB-Integrationstests aufgerufen.
//
// Der Caller-Kontext (organizationId, actorUserId, actorStaffId) muss bereits
// validiert und privilegiert sein; diese Funktion bypasst per Service-Role
// die RLS und erwartet, dass die aufrufende Server-Function vorher den Admin-
// Rollencheck erledigt hat.

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { writeAuditLog } from "@/lib/admin/audit";
import { loadTimeLock } from "@/lib/time/time-lock";
import { parseBunkerCsv } from "./parse-bunker";
import { parseTagesabrechnungCsv } from "./parse-tagesabrechnung";
import { importKeyOf } from "./derivations";
import type { NormalizedShift, SkipReason, SourceSystem } from "./normalize";

export type Counters = {
  read: number;
  imported: number;
  /** Teilmenge von `imported`: importierte Zeilen ohne aufgelöste location_id.
   *  NICHT Teil der Bilanz-Invariante (`imported + skipped === read`). */
  importedWithoutLocation: number;
  skippedByReason: Record<SkipReason, number>;
};

export function emptyCounters(): Counters {
  return {
    read: 0,
    imported: 0,
    importedWithoutLocation: 0,
    skippedByReason: { absence: 0, invalid_time: 0, unmapped_staff: 0, duplicate: 0 },
  };
}

export function parseCsvFor(sourceSystem: SourceSystem, csvText: string): NormalizedShift[] {
  return sourceSystem === "bunker" ? parseBunkerCsv(csvText) : parseTagesabrechnungCsv(csvText);
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Mappt einen Quell-Restaurantnamen case-insensitiv (getrimmt) auf eine COCO-location_id.
 * Reine Funktion → blockierend unit-testbar. null bei fehlendem/unbekanntem Namen.
 * Erwartete Namen in dieser Org: "Spicery"/"spicery", "YUM", "TSB" (Vergleich case-insensitiv).
 */
export function resolveLocationId(
  locationName: string | null,
  locByName: Map<string, string>,
): string | null {
  if (!locationName) return null;
  return locByName.get(locationName.trim().toLowerCase()) ?? null;
}

export type RunImportArgs = {
  admin: SupabaseClient<Database>;
  organizationId: string;
  actorUserId: string;
  actorStaffId: string | null;
  sourceSystem: SourceSystem;
  csvText: string;
  mode: "dry_run" | "commit";
};

export type RunImportResult = {
  mode: "dry_run" | "commit";
  fileHash: string;
  counters: Counters;
  runId: string | null;
  lockedThrough: string | null;
};

/**
 * Bilanz-Invariante: Jede gelesene Zeile landet entweder als Import oder als
 * gezählter Skip — ohne Lücke und ohne Doppelzählung. Wird am Ende von
 * executeImport gegen die Zähler geprüft; Verletzung => Programmierfehler.
 */
export function assertCounterBalance(counters: Counters): void {
  const skipped = Object.values(counters.skippedByReason).reduce((a, b) => a + b, 0);
  const sum = counters.imported + skipped;
  if (sum !== counters.read) {
    throw new Error(
      `Bilanz-Invariante verletzt: read=${counters.read}, imported=${counters.imported}, ` +
        `skipped=${skipped} (Summe=${sum}). Differenz=${counters.read - sum}.`,
    );
  }
}

export async function executeImport(args: RunImportArgs): Promise<RunImportResult> {
  const { admin, organizationId, actorUserId, actorStaffId, sourceSystem, csvText, mode } = args;

  const shifts = parseCsvFor(sourceSystem, csvText);
  const fileHash = sha256(csvText);
  const counters = emptyCounters();
  counters.read = shifts.length;

  // 1) Bestätigte Identity-Map.
  const { data: mapRows, error: mapErr } = await admin
    .from("staff_identity_map")
    .select("alt_id, staff_id, confirmed_at")
    .eq("organization_id", organizationId)
    .eq("source_system", sourceSystem);
  if (mapErr) throw mapErr;
  const mapByAltId = new Map<string, string | null>();
  for (const m of mapRows ?? []) if (m.confirmed_at) mapByAltId.set(m.alt_id, m.staff_id);

  // 2) Idempotenz-Check: bereits importierte import_keys.
  const { data: existingRows, error: exErr } = await admin
    .from("time_entries")
    .select("import_key")
    .eq("organization_id", organizationId)
    .eq("source", "import")
    .not("import_key", "is", null);
  if (exErr) throw exErr;
  const existingKeys = new Set<string>();
  for (const r of existingRows ?? []) if (r.import_key) existingKeys.add(r.import_key);

  // 2b) Standort-Namen → location_id (case-insensitiv). Quelle: optionale CSV-Spalte `restaurant`.
  const { data: locRows, error: locErr } = await admin
    .from("locations")
    .select("id, name")
    .eq("organization_id", organizationId);
  if (locErr) throw locErr;
  const locByName = new Map<string, string>();
  for (const l of locRows ?? []) if (l.name) locByName.set(l.name.trim().toLowerCase(), l.id);

  type Insertable = {
    organization_id: string;
    staff_id: string;
    started_at: string;
    ended_at: string;
    business_date: string;
    break_minutes: number;
    source: "import";
    import_key: string;
    location_id: string | null;
  };
  const inserts: Insertable[] = [];
  let maxBusinessDate: string | null = null;

  for (const s of shifts) {
    if (s.skipReason !== null) {
      counters.skippedByReason[s.skipReason]++;
      continue;
    }
    const altKey = s.altEmployeeId || s.altEmployeeName;
    const staffId = altKey ? (mapByAltId.get(altKey) ?? null) : null;
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
    const locationId = resolveLocationId(s.locationName, locByName);
    if (locationId === null) counters.importedWithoutLocation++;
    inserts.push({
      organization_id: organizationId,
      staff_id: staffId,
      started_at: s.startedAt,
      ended_at: s.endedAt,
      business_date: s.shiftDate,
      break_minutes: s.breakMinutes,
      source: "import",
      import_key: importKey,
      location_id: locationId,
    });
    if (!maxBusinessDate || s.shiftDate > maxBusinessDate) maxBusinessDate = s.shiftDate;
  }

  if (mode === "dry_run") {
    counters.imported = inserts.length;
    assertCounterBalance(counters);
    return { mode, fileHash, counters, runId: null, lockedThrough: null };
  }

  // 3) Commit: import_runs anlegen.
  const { data: runRow, error: runErr } = await admin
    .from("import_runs")
    .insert({
      organization_id: organizationId,
      source_system: sourceSystem,
      file_hash: fileHash,
      mode,
      counters: counters as unknown as Json,
      created_by: actorUserId,
    })
    .select("id")
    .single();
  if (runErr || !runRow) throw runErr ?? new Error("import_runs insert failed");
  const runId = runRow.id;

  if (inserts.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < inserts.length; i += CHUNK) {
      const slice = inserts.slice(i, i + CHUNK);
      const { error } = await admin.from("time_entries").insert(slice);
      if (error) throw error;
    }
  }
  counters.imported = inserts.length;
  assertCounterBalance(counters);

  await admin
    .from("import_runs")
    .update({
      finished_at: new Date().toISOString(),
      counters: counters as unknown as Json,
    })
    .eq("id", runId);

  await writeAuditLog({
    organizationId,
    actorUserId,
    actorStaffId,
    action: "time_entries.import",
    entity: "import_runs",
    entityId: runId,
    meta: { sourceSystem, fileHash, counters },
  });

  // 4) Wasserlinie nur vorwärts schieben.
  let newLock: string | null = null;
  if (maxBusinessDate) {
    const before = await loadTimeLock(admin, organizationId);
    if (!before || maxBusinessDate > before) {
      const { error: lockErr } = await admin
        .from("organization_settings")
        .upsert(
          { organization_id: organizationId, time_locked_through_date: maxBusinessDate },
          { onConflict: "organization_id" },
        );
      if (lockErr) throw lockErr;
      newLock = maxBusinessDate;
      await writeAuditLog({
        organizationId,
        actorUserId,
        actorStaffId,
        action: "settings.time_lock_moved",
        entity: "organization_settings",
        entityId: organizationId,
        meta: { before, after: maxBusinessDate, reason: "import_commit", runId },
      });
    }
  }

  return { mode, fileHash, counters, runId, lockedThrough: newLock };
}
