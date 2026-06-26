import type { Entgeltzeile } from "./types";

/** Amtlicher Sachbezugswert je Mahlzeit (Mittag-/Abendessen), in Cent, je Kalenderjahr. */
const MAHLZEIT_SACHBEZUG_CENT: Record<number, number> = { 2024: 413, 2025: 440, 2026: 457 };

export function mahlzeitSachbezugCent(year: number): number {
  const v = MAHLZEIT_SACHBEZUG_CENT[year];
  if (v == null) {
    throw new Error(`Sachbezugswert je Mahlzeit für ${year} nicht hinterlegt — bitte ergänzen.`);
  }
  return v;
}

export function countDistinctWorkdays(businessDates: string[]): number {
  return new Set(businessDates).size;
}

/**
 * Erzeugt die festen Zusatzzeilen Sachbezug + Mahlzeiten.
 * - Sachbezug nur, wenn > 0 (fix, unabhängig von Tagen).
 * - Mahlzeiten nur, wenn mealAllowance && workdayCount > 0.
 */
export function buildFixedZeilen(args: {
  sachbezugMonthlyCents: number;
  mealAllowance: boolean;
  workdayCount: number;
  year: number;
}): Entgeltzeile[] {
  const out: Entgeltzeile[] = [];
  if (args.sachbezugMonthlyCents > 0) {
    out.push({
      kategorie: "sachbezug_frei",
      bezeichnung: "Sachbezug (steuerfrei)",
      betragCent: args.sachbezugMonthlyCents,
    });
  }
  if (args.mealAllowance && args.workdayCount > 0) {
    out.push({
      kategorie: "mahlzeiten_paust",
      bezeichnung: "Tägliche Mahlzeiten (PauSt)",
      betragCent: args.workdayCount * mahlzeitSachbezugCent(args.year),
    });
  }
  return out;
}