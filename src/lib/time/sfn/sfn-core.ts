/**
 * B2-SFN — reine Kernhelfer für SFN-Berechnung auf einzelnem time_entry.
 *
 * Scope (laut docs/gruendungsdokument.md §B2-SFN):
 * - berechnet pro EINZELNER Schicht (time_entry) Minuten-Overlaps mit
 *   den jeweiligen Töpfen auf einer 0..2880-Minuten-Achse (Day-1+Day-2).
 * - kein DB-Zugriff, keine Tagesaggregation, keine Geld-Berechnung.
 * - Tages-/Wochensummen entstehen in B2c durch Aufsummieren der
 *   Topf-Werte über die Einträge; KEINE virtuelle Einträge-Verschmelzung.
 *
 * Bewusst NICHT enthalten (vertagt nach M4, Quelle: tagesabrechnung-sfnRates.ts,
 * vom Nutzer zitiert; Datei steht in M4 zur Verifikation an):
 *   - night40 (00–04) als Geld-Zuschlag,
 *   - holiday150 (1. Mai, 25./26.12.),
 *   - 50-€-Grundlohngrenze.
 * Gestrichen (Spekulation): 24.12.-ab-14:00-Regel.
 */

/** "HH:MM" oder "HH:MM:SS" → Minuten ab 00:00. null/leer → null. */
export function parseTimeToMin(t: string | null | undefined): number | null {
  if (!t) return null;
  const parts = t.split(":");
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/** Minuten-Overlap von [aS,aE) und [bS,bE) auf gemeinsamer Achse. */
export function overlapMin(aS: number, aE: number, bS: number, bE: number): number {
  return Math.max(0, Math.min(aE, bE) - Math.max(aS, bS));
}

/** Auf 2 Nachkommastellen runden — exakt wie tagesabrechnung-Original. */
export function round2(x: number): number {
  return Math.round(x * 100) / 100;
}