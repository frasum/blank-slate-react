// B-1/B-2: Reines Modul für die Pool-Zeit-Rückschreibung.
//
// Mitarbeiter, die nicht stempeln (Küche bei `kitchen_manual_only`, GL),
// haben ihre Arbeitszeit nur in `session_tip_pool_entries(shift_start,
// shift_end)`. Für den Lohn (M4) müssen diese Zeiten als `time_entries`
// vorliegen, denn `lohn-period.functions.ts` summiert ausschließlich
// abgeschlossene `time_entries` einer Periode.
//
// Diese Datei entscheidet — rein, ohne I/O — welche Pool-Einträge zu
// `time_entries`-Rows (source='pool') werden. Die Verdrahtung (Insert
// via supabaseAdmin) erfolgt in B-2.
//
// Abgrenzung zu Fähigkeit A: A aktualisiert existierende clock-Einträge
// der Stempler. B erzeugt NEUE Einträge nur für Nicht-Stempler — die
// Kollisionsregel (`staffWithRealEntry`) verhindert Doppelzählung im
// Lohn.
//
// B-2 ergänzt zwei reine Helfer:
//   * poolLocalTimeToIso — baut DST-korrekte ISO-Timestamps für den
//     Insert in time_entries (Europe/Berlin-Offset pro Tag).
//   * dropPoolWhenRealEntryExists — Lohn-Nachrangigkeit: falls für
//     einen (Mitarbeiter, Tag) zusätzlich ein echter Eintrag existiert
//     (clock/manual/import), werden die Pool-Zeilen jenes Tages
//     verworfen.

import { berlinOffsetMinutes, offsetString } from "@/lib/time/shift-hours";
import { kitchenShiftMinutes } from "./kitchen-shift-hours";

export type PoolWritebackEntry = {
  id: string;
  staffId: string;
  department: "kitchen" | "service" | "gl";
  shiftStart: string | null; // "HH:MM" oder "HH:MM:SS"
  shiftEnd: string | null;
};

export type PoolWritebackInput = {
  poolEntries: PoolWritebackEntry[];
  businessDate: string; // YYYY-MM-DD
  organizationId: string;
  locationId: string | null;
  staffWithRealEntry: Set<string>;
};

export type PoolTimeEntryRow = {
  organizationId: string;
  staffId: string;
  businessDate: string;
  startTime: string; // "HH:MM" lokal (Europe/Berlin) — Timestamp-Bau in B-2
  endTime: string;
  crossesMidnight: boolean;
  breakMinutes: 0;
  locationId: string | null;
  source: "pool";
  importKey: string; // `pool:${id}` → deterministisch, idempotent
};

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

function normalizeHHMM(value: string): string | null {
  const m = HHMM.exec(value.trim());
  if (!m) return null;
  const h = m[1].padStart(2, "0");
  return `${h}:${m[2]}`;
}

export function buildPoolTimeEntryRows(input: PoolWritebackInput): PoolTimeEntryRow[] {
  const rows: PoolTimeEntryRow[] = [];
  for (const entry of input.poolEntries) {
    // Regel 1: nur Einträge mit beidem Start UND Ende. GL ohne erfasste
    // Zeit fällt damit raus.
    if (!entry.shiftStart || !entry.shiftEnd) continue;

    // Regel 2: Kollision — echter clock/manual-Eintrag am gleichen Tag
    // schlägt die Pool-Zeit.
    if (input.staffWithRealEntry.has(entry.staffId)) continue;

    const start = normalizeHHMM(entry.shiftStart);
    const end = normalizeHHMM(entry.shiftEnd);
    if (!start || !end) continue;

    // 0-Dauer ist keine sinnvolle Arbeitszeit → überspringen.
    if (start === end) continue;

    rows.push({
      organizationId: input.organizationId,
      staffId: entry.staffId,
      businessDate: input.businessDate,
      startTime: start,
      endTime: end,
      crossesMidnight: end < start,
      breakMinutes: 0,
      locationId: input.locationId,
      source: "pool",
      importKey: `pool:${entry.id}`,
    });
  }
  return rows;
}

// Baut einen ISO-Timestamp für einen lokalen "HH:MM"-Zeitpunkt am
// businessDate (dayOffset=0) bzw. am Folgetag (dayOffset=1, für
// Mitternachts-Wraps). Verwendet den jeweils tagesgültigen Berlin-Offset
// — DST-sicher, weil offset des Folgetags eigenständig bestimmt wird.
export function poolLocalTimeToIso(businessDate: string, hhmm: string, dayOffset: 0 | 1): string {
  // businessDate ist YYYY-MM-DD; Tag ggf. um 1 verschieben.
  let isoDate = businessDate;
  if (dayOffset === 1) {
    const t = Date.UTC(
      Number(businessDate.slice(0, 4)),
      Number(businessDate.slice(5, 7)) - 1,
      Number(businessDate.slice(8, 10)),
      12,
      0,
      0,
    );
    const next = new Date(t + 24 * 3_600_000);
    isoDate = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(
      next.getUTCDate(),
    ).padStart(2, "0")}`;
  }
  const off = offsetString(berlinOffsetMinutes(isoDate));
  return new Date(`${isoDate}T${hhmm}:00${off}`).toISOString();
}

// Lohn-Nachrangigkeit: pro businessDate werden alle 'pool'-Zeilen
// verworfen, wenn am selben Tag mindestens ein Eintrag mit source !==
// 'pool' existiert (clock/manual/import).
export function dropPoolWhenRealEntryExists<T extends { businessDate: string; source: string }>(
  rows: T[],
): T[] {
  const realDays = new Set<string>();
  for (const r of rows) if (r.source !== "pool") realDays.add(r.businessDate);
  return rows.filter((r) => !(r.source === "pool" && realDays.has(r.businessDate)));
}

// ------------------------------------------------------------------------
// Laufender Sync (manuelle Pool-Korrekturen)
// ------------------------------------------------------------------------
//
// Anders als der B-2-Erzeuger oben (der beim Abgabe-Writeback nur neue
// Einträge einfügt), entscheidet dieser reine Helfer PRO Pool-Eintrag,
// ob der zugehörige `time_entries(source='pool')`-Datensatz aktualisiert
// (upsert) oder entfernt (delete) werden muss. Er ist die Grundlage für
// den laufenden Sync bei manuellen Zeit-Korrekturen und für den
// aktualisierenden Abgabe-Writeback.

const HHMM_ANY = /^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;
function normalize(value: string): string | null {
  const m = HHMM_ANY.exec(value.trim());
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

export type ResolvePoolSyncInput = {
  shiftStart: string | null;
  shiftEnd: string | null;
  department: "kitchen" | "service" | "gl";
  hasRealEntry: boolean;
};

export type ResolvePoolSyncResult =
  | { action: "delete" }
  | {
      action: "upsert";
      startTime: string;
      endTime: string;
      crossesMidnight: boolean;
      minutes: number;
    };

export function resolvePoolTimeEntrySync(input: ResolvePoolSyncInput): ResolvePoolSyncResult {
  // Regel 1: echter Stempel gewinnt — Pool-Eintrag entfernen.
  if (input.hasRealEntry) return { action: "delete" };
  // Regel 2: unvollständige Zeit → nichts synchronisieren, ggf. entfernen.
  if (!input.shiftStart || !input.shiftEnd) return { action: "delete" };
  const start = normalize(input.shiftStart);
  const end = normalize(input.shiftEnd);
  if (!start || !end) return { action: "delete" };
  if (start === end) return { action: "delete" };
  return {
    action: "upsert",
    startTime: start,
    endTime: end,
    crossesMidnight: end < start,
    minutes: kitchenShiftMinutes(start, end),
  };
}

// I/O-Helfer: einen einzelnen Pool-Eintrag mit `time_entries`
// synchronisieren. Nur `source='pool'`-Einträge werden geschrieben oder
// gelöscht — echte Stempel (clock/manual/import) bleiben unberührt.
// Best-effort: Fehler werden nach oben propagiert, der Aufrufer
// entscheidet, ob er sie schluckt.
export type SyncPoolTimeEntryInput = {
  organizationId: string;
  locationId: string | null;
  businessDate: string;
  entryId: string;
  staffId: string;
  department: "kitchen" | "service" | "gl";
  shiftStart: string | null;
  shiftEnd: string | null;
};

export type SyncPoolTimeEntryOutcome =
  | { action: "delete"; changed: boolean }
  | { action: "upsert"; changed: boolean };

export async function syncPoolTimeEntry(
  input: SyncPoolTimeEntryInput,
): Promise<SyncPoolTimeEntryOutcome> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const importKey = `pool:${input.entryId}`;

  const { data: realRows, error: realErr } = await supabaseAdmin
    .from("time_entries")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("staff_id", input.staffId)
    .eq("business_date", input.businessDate)
    .in("source", ["clock", "manual", "import"])
    .limit(1);
  if (realErr) throw realErr;
  const hasRealEntry = (realRows ?? []).length > 0;

  const decision = resolvePoolTimeEntrySync({
    shiftStart: input.shiftStart,
    shiftEnd: input.shiftEnd,
    department: input.department,
    hasRealEntry,
  });

  if (decision.action === "delete") {
    const { error, count } = await supabaseAdmin
      .from("time_entries")
      .delete({ count: "exact" })
      .eq("organization_id", input.organizationId)
      .eq("import_key", importKey)
      .eq("source", "pool");
    if (error) throw error;
    return { action: "delete", changed: (count ?? 0) > 0 };
  }

  const startedAt = poolLocalTimeToIso(input.businessDate, decision.startTime, 0);
  const endedAt = poolLocalTimeToIso(
    input.businessDate,
    decision.endTime,
    decision.crossesMidnight ? 1 : 0,
  );
  const { error, count } = await supabaseAdmin.from("time_entries").upsert(
    {
      organization_id: input.organizationId,
      staff_id: input.staffId,
      business_date: input.businessDate,
      started_at: startedAt,
      ended_at: endedAt,
      break_minutes: 0,
      location_id: input.locationId,
      source: "pool",
      import_key: importKey,
    },
    { onConflict: "organization_id,import_key", count: "exact" },
  );
  if (error) throw error;
  return { action: "upsert", changed: (count ?? 0) > 0 };
}
