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
import { selectAllPaged } from "@/lib/supabase/select-all";
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
    skippedByReason: {
      absence: 0,
      invalid_time: 0,
      unmapped_staff: 0,
      duplicate: 0,
      native_overlap: 0,
    },
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
  /** MIG1-Fix: Anzahl der beim Idempotenz-Check geladenen Bestands-Import-Keys.
   *  Sichtbar in Dry-Run/Commit-Ergebnissen — deckt eine wiederkehrende stille
   *  1000er-Kappung von PostgREST sofort auf. */
  existingKeyCount: number;
  /** MIG2: Erste 20 Kandidaten, die wegen Überlappung mit einem nativ
   *  gestempelten Eintrag geskippt wurden. Für die Generalprobe-Sichtung. */
  nativeOverlapSamples: NativeOverlapSample[];
};

export type NativeOverlapSample = {
  staffId: string;
  businessDate: string;
  candidate: { startedAt: string; endedAt: string };
  native: { startedAt: string; endedAt: string };
  overlapMinutes: number;
};

/** MIG2: Mindest-Überlappung, ab der ein Kandidat als Doppel-Import gilt.
 *  Bewusst 30 min — Randberührung/kleine Zeitdifferenzen zählen NICHT. */
const NATIVE_OVERLAP_MIN_MINUTES = 30;

/** Überlappungsdauer in Minuten (0 wenn disjunkt). */
export function overlapMinutes(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
  const aS = Date.parse(aStart);
  const aE = Date.parse(aEnd);
  const bS = Date.parse(bStart);
  const bE = Date.parse(bEnd);
  if (Number.isNaN(aS) || Number.isNaN(aE) || Number.isNaN(bS) || Number.isNaN(bE)) return 0;
  const overlapMs = Math.min(aE, bE) - Math.max(aS, bS);
  return overlapMs > 0 ? overlapMs / 60000 : 0;
}

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
    // <1000 by design: eine Zeile je (org, sourceSystem, alt_id) — in der
    // Praxis <200. Wächst nicht mit Import-Volumen.
    .select("alt_id, staff_id, confirmed_at")
    .eq("organization_id", organizationId)
    .eq("source_system", sourceSystem);
  if (mapErr) throw mapErr;
  const mapByAltId = new Map<string, string | null>();
  for (const m of mapRows ?? []) if (m.confirmed_at) mapByAltId.set(m.alt_id, m.staff_id);

  // 2) Idempotenz-Check: bereits importierte import_keys.
  //
  // MIG1-Fix (15.07.): PostgREST kappt ohne `.range()` bei 1000 Zeilen. Bei
  // >1000 bereits importierten Zeilen fielen Duplikate ab Position 1001 durch
  // den Rost und würden beim Commit ein zweites Mal importiert. Wir laden
  // deshalb konsequent seitenweise. Stabiles ORDER BY (import_key) sorgt für
  // deterministische Paginierung.
  const existingRows = await selectAllPaged<{ import_key: string | null }>(() =>
    admin
      .from("time_entries")
      .select("import_key")
      .eq("organization_id", organizationId)
      .eq("source", "import")
      .not("import_key", "is", null)
      .order("import_key", { ascending: true }),
  );
  const existingKeys = new Set<string>();
  for (const r of existingRows) if (r.import_key) existingKeys.add(r.import_key);
  const existingKeyCount = existingKeys.size;

  // 2c) MIG2: nativ gestempelte Einträge (source <> 'import') im Datumsbereich
  // der CSV laden. EIN paginierter Query, danach in-memory nach
  // (staff_id, business_date) gruppiert — kein N+1.
  //
  // Datumsbereich wird aus den nicht-skip-Kandidaten abgeleitet; Mitternachts-
  // Wrap ist bereits in startedAt/endedAt (ISO) enthalten, daher reicht der
  // business_date-Filter für die Native-Auswahl.
  const candidateDates = new Set<string>();
  for (const s of shifts) {
    if (s.skipReason === null && s.shiftDate) candidateDates.add(s.shiftDate);
  }
  const nativeByKey = new Map<string, { started_at: string; ended_at: string }[]>();
  if (candidateDates.size > 0) {
    const sortedDates = [...candidateDates].sort();
    const minDate = sortedDates[0];
    const maxDate = sortedDates[sortedDates.length - 1];
    const nativeRows = await selectAllPaged<{
      staff_id: string;
      business_date: string;
      started_at: string | null;
      ended_at: string | null;
    }>(() =>
      admin
        .from("time_entries")
        .select("staff_id, business_date, started_at, ended_at")
        .eq("organization_id", organizationId)
        .neq("source", "import")
        .gte("business_date", minDate)
        .lte("business_date", maxDate)
        .not("started_at", "is", null)
        .not("ended_at", "is", null)
        .order("staff_id", { ascending: true })
        .order("business_date", { ascending: true })
        .order("started_at", { ascending: true }),
    );
    for (const n of nativeRows) {
      if (!n.started_at || !n.ended_at) continue;
      const key = `${n.staff_id}|${n.business_date}`;
      let list = nativeByKey.get(key);
      if (!list) {
        list = [];
        nativeByKey.set(key, list);
      }
      list.push({ started_at: n.started_at, ended_at: n.ended_at });
    }
  }
  const nativeOverlapSamples: NativeOverlapSample[] = [];

  // 2b) Standort-Namen → location_id (case-insensitiv). Quelle: optionale CSV-Spalte `restaurant`.
  const { data: locRows, error: locErr } = await admin
    // ST1: bewusst ungefiltert — Daten-Zugriff (Migrations-Import: Name → ID).
    // <1000 by design: eine Organisation hat realistisch <50 Standorte.
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
    // MIG2: Überlappungs-Wächter NACH duplicate/invalid_time — die native
    // Prüfung setzt gültige Zeitfenster auf beiden Seiten voraus.
    const nativeList = nativeByKey.get(`${staffId}|${s.shiftDate}`);
    if (nativeList && nativeList.length > 0) {
      let hit: {
        native: { started_at: string; ended_at: string };
        overlap: number;
      } | null = null;
      for (const n of nativeList) {
        const ov = overlapMinutes(s.startedAt, s.endedAt, n.started_at, n.ended_at);
        if (ov >= NATIVE_OVERLAP_MIN_MINUTES) {
          hit = { native: n, overlap: ov };
          break;
        }
      }
      if (hit) {
        counters.skippedByReason.native_overlap++;
        if (nativeOverlapSamples.length < 20) {
          nativeOverlapSamples.push({
            staffId,
            businessDate: s.shiftDate,
            candidate: { startedAt: s.startedAt, endedAt: s.endedAt },
            native: { startedAt: hit.native.started_at, endedAt: hit.native.ended_at },
            overlapMinutes: Math.round(hit.overlap),
          });
        }
        continue;
      }
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
    return {
      mode,
      fileHash,
      counters,
      runId: null,
      lockedThrough: null,
      existingKeyCount,
      nativeOverlapSamples,
    };
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

  return {
    mode,
    fileHash,
    counters,
    runId,
    lockedThrough: newLock,
    existingKeyCount,
    nativeOverlapSamples,
  };
}
