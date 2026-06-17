/**
 * SFN-Zuschlagssätze (§3b EStG), 1:1 aus tagesabrechnung/src/lib/sfnRates.ts.
 *
 *   night25  = 0.25 // 20:00–00:00 und 04:00–06:00
 *   night40  = 0.40 // 00:00–04:00
 *   sunday   = 0.50
 *   holiday  = 1.25 // Standard-Feiertage
 *   holiday150 = 1.50 // 1. Mai, 25./26.12.
 */
export const SFN_RATES = {
  night25: 0.25,
  night40: 0.4,
  sunday: 0.5,
  holiday: 1.25,
  holiday150: 1.5,
} as const;

/**
 * §3b-Grundlohngrenze 50 €/h (in Cent).
 * Im Original definiert, aber NICHT angewendet — derzeit bewusst nicht angewandt
 * (Original-Verhalten); in einem späteren Schritt aktivierbar.
 */
export const SFN_TAX_FREE_HOURLY_LIMIT_CENT = 5000;
