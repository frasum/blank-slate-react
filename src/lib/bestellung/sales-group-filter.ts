// PV1-Refactor — reine Ableitung der Optionslisten für den kaskadierenden
// Gruppen-Filter (Hauptgruppe → Untergruppe → Warengruppe). Aus VA1 (inline
// in bestellung.verkaufsartikel.tsx) 1:1 extrahiert, damit sowohl VA1 als
// auch PV1 (POS-Verkauf) dieselbe Logik nutzen. Verhalten identisch: gleiche
// Fallback-Labels (`#<Nr>`) und alphabetische Sortierung nach Label.

export type GroupedRow = {
  hauptgruppe: string | null;
  hauptgruppeNr: number | null;
  untergruppe: string | null;
  untergruppeNr: number | null;
  warengruppe: string | null;
  productGroup: number | null;
};

export type GroupOption = { value: string; label: string };

export const ALL = "__all__";

function keyLabel(
  name: string | null,
  nr: number | null,
  labelPrefix: string,
): { key: string; label: string } | null {
  if (name) return { key: name, label: name };
  if (nr !== null) return { key: `#${nr}`, label: `${labelPrefix} ${nr}` };
  return null;
}

function collect(entries: Iterable<{ key: string; label: string } | null>): GroupOption[] {
  const m = new Map<string, string>();
  for (const e of entries) if (e) m.set(e.key, e.label);
  return Array.from(m.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "de"));
}

export function deriveHauptOptions(rows: readonly GroupedRow[]): GroupOption[] {
  return collect(rows.map((r) => keyLabel(r.hauptgruppe, r.hauptgruppeNr, "Hauptgruppe")));
}

export function deriveUnterOptions(rows: readonly GroupedRow[]): GroupOption[] {
  return collect(rows.map((r) => keyLabel(r.untergruppe, r.untergruppeNr, "Untergruppe")));
}

export function deriveWgOptions(rows: readonly GroupedRow[]): GroupOption[] {
  return collect(rows.map((r) => keyLabel(r.warengruppe, r.productGroup, "WG")));
}

/** Filter-Predicate für Hauptgruppen-Match (inkl. Fallback `#Nr`). */
export function matchesHaupt(row: GroupedRow, value: string): boolean {
  return (row.hauptgruppe ?? (row.hauptgruppeNr !== null ? `#${row.hauptgruppeNr}` : "")) === value;
}

export function matchesUnter(row: GroupedRow, value: string): boolean {
  return (row.untergruppe ?? (row.untergruppeNr !== null ? `#${row.untergruppeNr}` : "")) === value;
}

export function matchesWg(row: GroupedRow, value: string): boolean {
  return (row.warengruppe ?? (row.productGroup !== null ? `#${row.productGroup}` : "")) === value;
}

/** Bucket-Sentinel für „Ohne Zuordnung" (PV1). */
export const UNMATCHED = "__unmatched__";
