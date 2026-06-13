// Reparatur-Kern für „Fehlzuordnungen umhängen".
//
// Hintergrund: Beim manuellen Identitäts-Mapping wurden mehrere Alt-Identitäten
// versehentlich auf einen falschen Staff (typisch: „Admin") gemappt. Nach
// Korrektur in staff_identity_map sollen die bereits importierten
// time_entries (source='import') idempotent auf den laut Mapping korrekten
// staff_id umgehängt werden — ohne Wasserlinie zu verschieben und ohne
// Geld-/Zeitwerte zu verändern.
//
// Regeln:
//   - Alt-ID = Teil nach erstem ':' im import_key
//     (Format z.B. 'tagesabrechnung:<ALT-ID>').
//   - Es werden NUR Zeilen umgehängt, deren laut staff_identity_map
//     korrekter staff_id von dem aktuell gesetzten staff_id abweicht.
//   - Mappings ohne confirmed_at oder ohne staff_id werden ignoriert (sie
//     sind nicht autoritativ).
//   - Idempotent: zweiter Lauf findet keine Mismatches mehr → 0 Updates.
//   - Partieller Unique-Index `time_entries_one_open_per_staff` greift nur
//     bei ended_at IS NULL — Import-Schichten müssen geschlossen sein. Wenn
//     wider Erwarten doch offene Zeilen betroffen sind, brechen wir ab.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { SourceSystem } from "./normalize";

export type ReassignGroup = {
  altId: string;
  altName: string;
  fromStaffId: string;
  fromStaffName: string;
  toStaffId: string;
  toStaffName: string;
  shiftCount: number;
  minBusinessDate: string | null;
  maxBusinessDate: string | null;
};

export type ReassignResult = {
  mode: "dry_run" | "commit";
  totalScanned: number;
  totalMismatched: number;
  totalUpdated: number;
  groups: ReassignGroup[];
};

export async function reassignImportedStaffCore(args: {
  admin: SupabaseClient<Database>;
  organizationId: string;
  sourceSystem: SourceSystem;
  mode: "dry_run" | "commit";
}): Promise<ReassignResult> {
  const { admin, organizationId, sourceSystem, mode } = args;

  // 1) Autoritative Mappings laden (confirmed + staff_id gesetzt).
  const { data: mapRows, error: mapErr } = await admin
    .from("staff_identity_map")
    .select("alt_id, alt_name, staff_id, confirmed_at")
    .eq("organization_id", organizationId)
    .eq("source_system", sourceSystem);
  if (mapErr) throw mapErr;
  const mapByAltId = new Map<string, { staffId: string; altName: string }>();
  for (const m of mapRows ?? []) {
    if (m.confirmed_at && m.staff_id) {
      mapByAltId.set(m.alt_id, { staffId: m.staff_id, altName: m.alt_name ?? m.alt_id });
    }
  }

  // 2) Importierte time_entries laden — nur diese Quelle (Prefix im import_key).
  const prefix = `${sourceSystem}:`;
  // PostgREST liefert default max. 1000 Zeilen → paginieren, sonst werden
  // Fehlzuordnungen jenseits der Wasserlinie übersehen (Symptom: „gescannt
  // 1000, betroffen 0", obwohl real >1000 Importzeilen existieren).
  type EntryRow = {
    id: string;
    staff_id: string;
    import_key: string | null;
    business_date: string;
    ended_at: string | null;
  };
  const entries: EntryRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data: page, error: teErr } = await admin
      .from("time_entries")
      .select("id, staff_id, import_key, business_date, ended_at")
      .eq("organization_id", organizationId)
      .eq("source", "import")
      .like("import_key", `${prefix}%`)
      .order("id", { ascending: true })
      .range(from, to);
    if (teErr) throw teErr;
    const rows = (page ?? []) as EntryRow[];
    entries.push(...rows);
    if (rows.length < pageSize) break;
  }

  // 3) Mismatches ermitteln.
  type Mismatch = {
    id: string;
    fromStaffId: string;
    toStaffId: string;
    altId: string;
    altName: string;
    businessDate: string;
    endedAt: string | null;
  };
  const mismatches: Mismatch[] = [];
  for (const e of entries ?? []) {
    if (!e.import_key) continue;
    const altId = e.import_key.slice(prefix.length).split(":")[0] ?? "";
    if (!altId) continue;
    const target = mapByAltId.get(altId);
    if (!target) continue;
    if (target.staffId === e.staff_id) continue;
    mismatches.push({
      id: e.id,
      fromStaffId: e.staff_id,
      toStaffId: target.staffId,
      altId,
      altName: target.altName,
      businessDate: e.business_date,
      endedAt: e.ended_at,
    });
  }

  // 4) Verifikation: keine offenen Import-Schichten unter den Mismatches.
  const openOnes = mismatches.filter((m) => m.endedAt === null);
  if (openOnes.length > 0) {
    throw new Error(
      `Reassign abgebrochen: ${openOnes.length} betroffene Import-Schicht(en) sind nicht geschlossen (ended_at IS NULL). Erwartet: alle Import-Schichten geschlossen.`,
    );
  }

  // 5) Staff-Namen für den Bericht auflösen.
  const staffIds = new Set<string>();
  for (const m of mismatches) {
    staffIds.add(m.fromStaffId);
    staffIds.add(m.toStaffId);
  }
  const nameById = new Map<string, string>();
  if (staffIds.size > 0) {
    const { data: staffRows, error: sErr } = await admin
      .from("staff")
      .select("id, display_name")
      .in("id", Array.from(staffIds));
    if (sErr) throw sErr;
    for (const s of staffRows ?? []) nameById.set(s.id, s.display_name ?? s.id);
  }

  // 6) Gruppieren je (altId, from, to).
  const groupKey = (m: Mismatch) => `${m.altId}|${m.fromStaffId}|${m.toStaffId}`;
  const grouped = new Map<string, ReassignGroup & { _ids: string[] }>();
  for (const m of mismatches) {
    const key = groupKey(m);
    let g = grouped.get(key);
    if (!g) {
      g = {
        altId: m.altId,
        altName: m.altName,
        fromStaffId: m.fromStaffId,
        fromStaffName: nameById.get(m.fromStaffId) ?? m.fromStaffId,
        toStaffId: m.toStaffId,
        toStaffName: nameById.get(m.toStaffId) ?? m.toStaffId,
        shiftCount: 0,
        minBusinessDate: null,
        maxBusinessDate: null,
        _ids: [],
      };
      grouped.set(key, g);
    }
    g.shiftCount++;
    g._ids.push(m.id);
    if (!g.minBusinessDate || m.businessDate < g.minBusinessDate)
      g.minBusinessDate = m.businessDate;
    if (!g.maxBusinessDate || m.businessDate > g.maxBusinessDate)
      g.maxBusinessDate = m.businessDate;
  }

  // 7) Commit: bulk-Update je Zielstaff (Batches à 200 IDs).
  let totalUpdated = 0;
  if (mode === "commit") {
    // Pro Gruppe das Ziel setzen. WHERE-Klausel sichert per staff_id-Mismatch,
    // dass parallele Läufe nicht doppelt zählen (Idempotenz-Backstop).
    for (const g of grouped.values()) {
      const ids = g._ids;
      const chunkSize = 200;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const slice = ids.slice(i, i + chunkSize);
        const { data: updated, error: updErr } = await admin
          .from("time_entries")
          .update({ staff_id: g.toStaffId })
          .in("id", slice)
          .eq("organization_id", organizationId)
          .eq("source", "import")
          .neq("staff_id", g.toStaffId)
          .select("id");
        if (updErr) throw updErr;
        totalUpdated += updated?.length ?? 0;
      }
    }
  }

  const groups: ReassignGroup[] = Array.from(grouped.values())
    .map(({ _ids: _drop, ...rest }) => rest)
    .sort((a, b) => a.altName.localeCompare(b.altName, "de"));

  return {
    mode,
    totalScanned: entries?.length ?? 0,
    totalMismatched: mismatches.length,
    totalUpdated,
    groups,
  };
}
