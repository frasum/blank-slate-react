// BB1 — Auto-Text für die Buchhaltungs-Spalte „Besonderheiten".
// Rein, deterministisch, ohne DB/UI. Wird zur Anzeige-/Export-Zeit
// aus roster_absence berechnet und NIE gespeichert (eine Wahrheit an
// der Quelle; Korrekturen erfolgen im Urlaubs-/Krank-Datensatz).

import { mergeAbsenceRanges } from "@/lib/roster/vacation-planner";

export type AbsenceNoteInput = { date: string; type: "urlaub" | "krank" };

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatDay(iso: string): { d: string; m: string } {
  return { d: pad2(Number(iso.slice(8, 10))), m: pad2(Number(iso.slice(5, 7))) };
}

function formatRange(startIso: string, endIso: string): string {
  const s = formatDay(startIso);
  const e = formatDay(endIso);
  if (startIso === endIso) return `${s.d}.${s.m}.`;
  if (s.m === e.m) return `${s.d}.–${e.d}.${e.m}.`;
  return `${s.d}.${s.m}.–${e.d}.${e.m}.`;
}

const LABEL: Record<"urlaub" | "krank", string> = {
  urlaub: "Urlaub",
  krank: "Krank",
};

/**
 * Formatiert Abwesenheits-Tage einer Periode als kurzen Anzeige-Text.
 * - Auf [periodStart, periodEnd] geklippt (inklusive Grenzen, ISO YYYY-MM-DD).
 * - Je Typ zu lückenlosen Bereichen zusammengefasst (mergeAbsenceRanges).
 * - Reihenfolge chronologisch nach Bereichsbeginn; Trenner " · ".
 */
export function formatAbsenceNote(
  dates: ReadonlyArray<AbsenceNoteInput>,
  periodStart: string,
  periodEnd: string,
): string {
  if (periodEnd < periodStart) return "";
  const byType: Record<"urlaub" | "krank", string[]> = { urlaub: [], krank: [] };
  for (const entry of dates) {
    if (entry.date < periodStart || entry.date > periodEnd) continue;
    byType[entry.type].push(entry.date);
  }
  type Segment = { start: string; end: string; type: "urlaub" | "krank" };
  const segments: Segment[] = [];
  for (const t of ["urlaub", "krank"] as const) {
    for (const r of mergeAbsenceRanges(byType[t])) {
      segments.push({ start: r.start, end: r.end, type: t });
    }
  }
  segments.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  return segments.map((s) => `${LABEL[s.type]} ${formatRange(s.start, s.end)}`).join(" · ");
}
