// Reines Rechen-Modul für das Einheitenmodell (E1).
// Geld: Cents (auch gebrochene Cents als number). Faktor > 0. Ergebnisse für
// gespeicherte Werte (`line_value_cents`) sind ganzzahlige Cents (Math.round).
// Kein DB-/UI-Zugriff — ausschließlich reine Funktionen, damit sie Server-
// (RPC/Server-Fn) und Client-seitig (Live-Anzeige) byte-identisch rechnen.

const QTY_EPS = 1e-9;

export function normalizedPriceCents(priceCents: number, factor: number): number {
  if (!(factor > 0)) throw new Error("factor muss > 0 sein.");
  return priceCents / factor;
}

export function computeInventoryLineValueCents(
  qtyBar: number,
  qtyDry: number,
  priceCents: number,
  factor: number,
): number {
  const total = qtyBar + qtyDry;
  return Math.round(total * normalizedPriceCents(priceCents, factor));
}

export type OrderQuantityOptions = {
  step: number;
  min: number;
  allowDecimal: boolean;
};

export type OrderQuantityResult = { ok: true } | { ok: false; reason: string };

function isMultipleOf(value: number, step: number): boolean {
  if (!(step > 0)) return false;
  const q = value / step;
  return Math.abs(q - Math.round(q)) < QTY_EPS;
}

export function validateOrderQuantity(
  qty: number,
  opts: OrderQuantityOptions,
): OrderQuantityResult {
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, reason: "Menge muss größer als 0 sein." };
  }
  if (qty + QTY_EPS < opts.min) {
    return { ok: false, reason: `Mindestbestellmenge: ${formatQty(opts.min)}` };
  }
  if (!opts.allowDecimal && Math.abs(qty - Math.round(qty)) > QTY_EPS) {
    return { ok: false, reason: "Nur ganzzahlige Mengen erlaubt." };
  }
  if (opts.step > 0 && !isMultipleOf(qty, opts.step)) {
    return { ok: false, reason: `Menge muss ein Vielfaches von ${formatQty(opts.step)} sein.` };
  }
  return { ok: true };
}

function formatQty(n: number): string {
  return Number.isInteger(n) ? n.toString() : n.toLocaleString("de-DE");
}

function formatEuroCents(cents: number, maxFractionDigits = 2): string {
  return (
    (cents / 100).toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: maxFractionDigits,
    }) + " €"
  );
}

function formatNormalizedPriceCents(cents: number): string {
  // bis zu 4 Nachkommastellen, überflüssige Nullen kappen (0,7875 / 0,80 / 3,20).
  const euro = cents / 100;
  const s = euro.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
  return s + " €";
}

export function formatUnitPrice(
  priceCents: number,
  orderUnit: string,
  factor: number,
  inventoryUnit: string,
): string {
  if (factor === 1 || orderUnit === inventoryUnit) {
    return `${formatEuroCents(priceCents)} / ${orderUnit}`;
  }
  const normalized = normalizedPriceCents(priceCents, factor);
  return (
    `${formatEuroCents(priceCents)} / ${orderUnit} · ` +
    `1 ${orderUnit} = ${formatQty(factor)} ${inventoryUnit} · ` +
    `${formatNormalizedPriceCents(normalized)} / ${inventoryUnit}`
  );
}

export { formatQty as _formatQty, formatNormalizedPriceCents };