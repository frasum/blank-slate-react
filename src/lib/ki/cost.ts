// KI1 — Preistabelle für Anthropic-Modelle. Cent-genau als Mikrocent
// (1 Cent = 1_000_000 Mikrocent) gerechnet, damit Summen aus vielen
// kleinen Anfragen nicht durch Rundung verlorengehen.
//
// Quellen (Stand Juli 2026):
//   claude-haiku-4-5:  Input  1 $/M   Output  5 $/M
//   claude-sonnet-4-6: Input  3 $/M   Output 15 $/M
// Umrechnung mit festem USD→EUR-Kurs 0,92 (Konstante, damit die Anzeige
// deterministisch bleibt — echte Abrechnung erfolgt eh via Anthropic).
//
// Preise sind absichtlich als Konstanten hier gepflegt, nicht in der DB —
// so ist ein Preis-Update ein Commit mit klarem Diff.

export const USD_EUR_RATE = 0.92;

type ModelPricing = {
  /** USD pro 1 Mio. Input-Tokens */
  inputUsdPerMillion: number;
  /** USD pro 1 Mio. Output-Tokens */
  outputUsdPerMillion: number;
};

const PRICING: Record<string, ModelPricing> = {
  "claude-haiku-4-5": { inputUsdPerMillion: 1, outputUsdPerMillion: 5 },
  "claude-sonnet-4-6": { inputUsdPerMillion: 3, outputUsdPerMillion: 15 },
};

/** Fallback (Haiku), falls Modell unbekannt. */
const FALLBACK: ModelPricing = PRICING["claude-haiku-4-5"];

/**
 * Kosten einer Anfrage in Mikrocent (Cent × 1_000_000). BIGINT-freundlich.
 * Formel: (input×in$/1e6 + output×out$/1e6) × EUR-Kurs × 100 (Cent) × 1e6 (Mikro).
 */
export function costMicroCents(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const p = PRICING[model] ?? FALLBACK;
  const usd =
    (inputTokens * p.inputUsdPerMillion + outputTokens * p.outputUsdPerMillion) / 1_000_000;
  const eur = usd * USD_EUR_RATE;
  // Cent × 1e6 = Mikrocent
  return Math.round(eur * 100 * 1_000_000);
}

/** Mikrocent → EUR-String mit 2 Nachkommastellen. */
export function formatEurFromMicroCents(mc: number): string {
  const eur = mc / 1_000_000 / 100;
  return eur.toFixed(2);
}