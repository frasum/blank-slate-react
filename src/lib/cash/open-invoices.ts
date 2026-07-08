// Offene-Rechnungen mit Reservierungsname pro Position.
// Datenformat auf `waiter_settlements.open_invoices_details` (jsonb):
//   [{ "name": "Meier", "cents": 4500 }, ...]
//
// Sichtbar überall dort, wo Kellner/Manager offene Rechnungen erfassen
// oder anzeigen. Reines Modul — keine Supabase-Aufrufe, keine Seiteneffekte.
//
// Regel (systemweit — einzige Wahrheit):
// - Ein Reservierungsname ist genau dann Pflicht, wenn ein Betrag > 0
//   eingegeben wurde. Zeilen ohne Betrag > 0 werden verworfen (auch mit
//   Name). Betrag > 0 ohne Name blockiert die Abgabe.
// - Erzwungen an vier Stellen mit identischer Semantik:
//   1) Kellner-UI (routes/_authenticated/zeit/abrechnung.tsx) — blockt
//      den Absende-Button.
//   2) Admin-Dialoge (routes/_authenticated/admin/kasse.tsx,
//      Helper `toOpenInvoiceEntries`) — wirft Fehler.
//   3) Server (lib/cash/cash.functions.ts, `resolveOpenInvoicesInput`) —
//      wirft Fehler; die Summe wird IMMER server-seitig aus den Einträgen
//      berechnet (Client-Summe wird verworfen).
//   4) DB-Trigger `tg_waiter_settlements_validate_open_invoices` — letzte
//      Verteidigungslinie (Migration 20260708043308).
// - `parseOpenInvoiceEntries` (unten) und Print/PDF filtern leere Namen
//   defensiv aus. Bei neu geschriebenen Zeilen kann das durch die
//   Trigger-Regel gar nicht mehr auftreten — der Filter schützt nur
//   Altdaten aus der Zeit vor der Regel.

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
