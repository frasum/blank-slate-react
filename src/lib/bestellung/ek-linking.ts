// EKZ1 — Rein-funktionale Helfer für die EK-Zuordnungs-Werkbank.
//
// Zweck: EIN Rechenweg für den materialisierten Einkaufspreis eines
// Verkaufsartikels aus (Einkaufspreis × Portion-ml / Gebinde-ml). Alles
// I/O passiert in den Server-Fns; hier stehen nur pure Funktionen mit
// Tests. „Kaufmännisch gerundet" = Math.round auf ganze Cents.

export type EkComputeInput = {
  sourcePriceCents: number;
  portionMl: number | null;
  sourceVolumeMl: number | null;
};

export type EkComputeResult =
  | { ok: true; ekCents: number; ratio: number }
  | { ok: false; error: string };

/**
 * Berechnet den EK eines Verkaufsartikels aus dem Gebindepreis + Portion/Gebinde.
 * Regeln:
 *   – Beide ml-Werte NULL: 1:1-Fall (ganze Flasche/Gebinde = Verkaufseinheit) → ekCents = sourcePriceCents.
 *   – Beide ml-Werte gesetzt: kaufmännisch gerundet → Math.round(price × portion / source).
 *   – Genau eines gesetzt: Fehler (Konsistenz mit DB-CHECK).
 *   – portion > source: Fehler (Konsistenz mit DB-CHECK).
 *   – sourcePriceCents < 0 oder nicht integer: Fehler.
 */
export function computeEkFromLink(input: EkComputeInput): EkComputeResult {
  const { sourcePriceCents, portionMl, sourceVolumeMl } = input;
  if (!Number.isInteger(sourcePriceCents) || sourcePriceCents < 0) {
    return { ok: false, error: "sourcePriceCents muss ein nicht-negativer Integer sein." };
  }
  const hasPortion = portionMl !== null;
  const hasSource = sourceVolumeMl !== null;
  if (hasPortion !== hasSource) {
    return {
      ok: false,
      error: "Portion und Gebinde-Volumen müssen entweder beide gesetzt oder beide leer sein.",
    };
  }
  if (!hasPortion) {
    return { ok: true, ekCents: sourcePriceCents, ratio: 1 };
  }
  if (!Number.isInteger(portionMl!) || portionMl! <= 0) {
    return { ok: false, error: "Portion-ml muss ein positiver Integer sein." };
  }
  if (!Number.isInteger(sourceVolumeMl!) || sourceVolumeMl! <= 0) {
    return { ok: false, error: "Gebinde-ml muss ein positiver Integer sein." };
  }
  if (portionMl! > sourceVolumeMl!) {
    return { ok: false, error: "Portion darf das Gebinde nicht übersteigen." };
  }
  const ratio = portionMl! / sourceVolumeMl!;
  const ekCents = Math.round((sourcePriceCents * portionMl!) / sourceVolumeMl!);
  return { ok: true, ekCents, ratio };
}

/**
 * Extrahiert das Gebinde-Volumen in Milliliter aus einem Einkaufsartikel-Namen.
 * Erkennt "0,75l", "1,0l", "70cl", "500ml", "1L", jeweils mit optionalem Leerzeichen.
 * Rückgabe null, wenn nichts Eindeutiges gefunden — Formular fragt dann nach.
 */
export function parseVolumeMlFromName(name: string): number | null {
  if (!name) return null;
  const re = /(\d+(?:[.,]\d+)?)\s?(ml|cl|l)\b/gi;
  let bestMl: number | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(name)) !== null) {
    const num = Number(m[1].replace(",", "."));
    if (!Number.isFinite(num) || num <= 0) continue;
    const unit = m[2].toLowerCase();
    const ml = unit === "l" ? num * 1000 : unit === "cl" ? num * 10 : num;
    const rounded = Math.round(ml);
    // Bei mehreren Treffern gewinnt der größte (typisch: Gebinde nennt eine Zahl).
    if (bestMl === null || rounded > bestMl) bestMl = rounded;
  }
  return bestMl;
}

/**
 * Extrahiert eine Portion aus einem Verkaufsartikel-Namen ("Wein 0,2",
 * "Schnaps 4 cl", "Bier 0,5"). Zahlen unter 3 werden als Liter interpretiert
 * (Standard-Gastro-Schreibweise: 0,2 / 0,3 / 0,4 / 0,5). Ohne Einheit und
 * ohne Kommazahl → null (kein Rate-Ergebnis für nackte Zahlen).
 */
export function parsePortionMlFromName(name: string): number | null {
  if (!name) return null;
  // Einheit vorhanden: direkt konvertieren.
  const withUnit = /(\d+(?:[.,]\d+)?)\s?(ml|cl|l)\b/i.exec(name);
  if (withUnit) {
    const num = Number(withUnit[1].replace(",", "."));
    if (!Number.isFinite(num) || num <= 0) return null;
    const unit = withUnit[2].toLowerCase();
    const ml = unit === "l" ? num * 1000 : unit === "cl" ? num * 10 : num;
    return Math.round(ml);
  }
  // Ohne Einheit: nur Dezimal-Liter (0,1 – 2,9) akzeptieren.
  const decimal = /(?:^|\s)(0[.,]\d+|[12][.,]\d+)(?:\s|$)/.exec(name);
  if (decimal) {
    const num = Number(decimal[1].replace(",", "."));
    if (Number.isFinite(num) && num > 0 && num < 3) return Math.round(num * 1000);
  }
  return null;
}
