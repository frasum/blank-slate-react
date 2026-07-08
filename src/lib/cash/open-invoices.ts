// Offene-Rechnungen mit Reservierungsname pro Position.
// Datenformat auf `waiter_settlements.open_invoices_details` (jsonb):
//   [{ "name": "Meier", "cents": 4500 }, ...]
//
// Sichtbar überall dort, wo Kellner/Manager offene Rechnungen erfassen
// oder anzeigen. Reines Modul — keine Supabase-Aufrufe, keine Seiteneffekte.

import { z } from "zod";

export type OpenInvoiceEntry = {
  name: string;
  cents: number;
};

export const openInvoiceEntrySchema = z.object({
  name: z.string().trim().min(1).max(120),
  cents: z.number().int().min(0),
});

export const openInvoiceEntriesSchema = z.array(openInvoiceEntrySchema).default([]);

export function sumOpenInvoiceEntries(entries: readonly OpenInvoiceEntry[]): number {
  let sum = 0;
  for (const e of entries) sum += e.cents;
  return sum;
}

// Normalisiert Rohdaten aus JSONB. Unbekannte/kaputte Einträge werden
// verworfen, damit alte Zeilen (leeres Array) und robuste Reads möglich
// bleiben, ohne dass die UI wegen einer einzelnen fehlerhaften Zeile
// crasht.
export function parseOpenInvoiceEntries(raw: unknown): OpenInvoiceEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: OpenInvoiceEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const name = String((item as { name?: unknown }).name ?? "").trim();
    const centsRaw = (item as { cents?: unknown }).cents;
    const cents =
      typeof centsRaw === "number"
        ? centsRaw
        : typeof centsRaw === "string"
          ? Number(centsRaw)
          : NaN;
    if (!name) continue;
    if (!Number.isFinite(cents) || cents < 0) continue;
    out.push({ name, cents: Math.round(cents) });
  }
  return out;
}

// Menschenlesbare Namensliste für Anzeigen (Tagesdruck, Admin-Zeilen).
// Reihenfolge = Eingabereihenfolge. Doppelte Namen werden bewusst nicht
// dedupliziert (es sind separate Rechnungen).
export function formatOpenInvoiceNames(entries: readonly OpenInvoiceEntry[]): string {
  return entries
    .map((e) => e.name.trim())
    .filter((n) => n.length > 0)
    .join(" · ");
}