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
