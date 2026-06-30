// B-1: Reines Modul für die Pool-Zeit-Rückschreibung.
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