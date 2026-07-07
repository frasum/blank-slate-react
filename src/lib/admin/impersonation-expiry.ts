// IMP2 — Ablaufzeit für Admin-Vorschauen.
//
// Reines Modul (kein Supabase-Zugriff): berechnet, ob eine offene
// Impersonation die Maximaldauer überschritten hat. Wird von
// `resolveActiveImpersonation` (server) und vom Vorschau-Banner (client)
// wiederverwendet, damit Server und UI mit demselben Grenzwert arbeiten.

export const IMPERSONATION_MAX_MINUTES = 60;

/**
 * Grenzfall: exakt `maxMinutes` gelten noch als NICHT abgelaufen; erst
 * das nächste Millisekunden-Tick löst das Ablauf-Ereignis aus. Beide
 * Zeitstempel werden als ISO-Strings (UTC) übergeben, damit die Funktion
 * zeitzonen-neutral bleibt.
 */
export function isImpersonationExpired(
  startedAtIso: string,
  nowIso: string,
  maxMinutes: number = IMPERSONATION_MAX_MINUTES,
): boolean {
  const started = Date.parse(startedAtIso);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(started) || !Number.isFinite(now)) return false;
  return now - started > maxMinutes * 60_000;
}

/** Verbleibende Millisekunden bis zum Ablauf; nie negativ. */
export function impersonationRemainingMs(
  startedAtIso: string,
  nowIso: string,
  maxMinutes: number = IMPERSONATION_MAX_MINUTES,
): number {
  const started = Date.parse(startedAtIso);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(started) || !Number.isFinite(now)) return 0;
  return Math.max(0, started + maxMinutes * 60_000 - now);
}