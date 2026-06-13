// Reparatur (Option A zur fehlerhaften Identitätszuordnung): löscht
// importierte time_entries (`source='import'`), damit anschließend ein
// erneuter Import mit korrigiertem staff_identity_map die Schichten
// idempotent neu anlegt — Wasserlinie wird NICHT verschoben.
//
// Sicherheitsregeln:
//   * Wirkt ausschließlich auf `source='import'`. Niemals 'clock' oder
//     'manual' (die Filterklauseln stehen ab Insert/Delete an erster Stelle
//     und sind nicht optional).
//   * Optionaler staff_id-Filter, um nur eine Teilmenge (z.B. „Admin") zu
//     bereinigen.
//   * Wenn unter den Treffern auch nur eine Zeile offen ist
//     (`ended_at IS NULL`), wird abgebrochen — Import-Schichten sind per
//     Definition geschlossen; offene Zeilen weisen auf Datenpfusch hin und
//     müssen separat untersucht werden.
//   * PostgREST liefert standardmäßig max. 1000 Zeilen; sowohl Scan als auch
//     Delete werden seitenweise verarbeitet.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type DeleteImportedStaffGroup = {
  staffId: string;
  staffName: string;
  shiftCount: number;
};

export type DeleteImportedResult = {
  mode: "dry_run" | "commit";
  totalMatched: number;
  totalDeleted: number;
  minBusinessDate: string | null;
  maxBusinessDate: string | null;
  staffGroups: DeleteImportedStaffGroup[];
  filter: { staffId: string | null };
};

const PAGE_SIZE = 1000;
// PostgREST encodes `.in("id", [...])` als Query-String — bei 1000 UUIDs
// überschreitet die URL die ~8 KB-Grenze von Supabase/Cloudflare und der
// Aufruf wird mit HTTP 400 abgelehnt. Daher in kleineren Häppchen löschen.
const DELETE_BATCH_SIZE = 200;

export async function deleteImportedShiftsCore(args: {
  admin: SupabaseClient<Database>;
  organizationId: string;
  staffId: string | null;
  mode: "dry_run" | "commit";
}): Promise<DeleteImportedResult> {
  const { admin, organizationId, staffId, mode } = args;

  // 1) Treffer laden (paginiert), nur source='import'.
  type Row = {
    id: string;
    staff_id: string;
    business_date: string;
    ended_at: string | null;
  };
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let q = admin
      .from("time_entries")
      .select("id, staff_id, business_date, ended_at")
      .eq("organization_id", organizationId)
      .eq("source", "import")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (staffId) q = q.eq("staff_id", staffId);
    const { data: page, error } = await q;
    if (error) throw error;
    const pageRows = (page ?? []) as Row[];
    rows.push(...pageRows);
    if (pageRows.length < PAGE_SIZE) break;
  }

  // 2) Sicherheitscheck: keine offenen Schichten unter den Treffern.
  const open = rows.filter((r) => r.ended_at === null);
  if (open.length > 0) {
    throw new Error(
      `Löschen abgebrochen: ${open.length} Treffer ist/sind offen (ended_at IS NULL). ` +
        `Import-Schichten müssen geschlossen sein.`,
    );
  }

  // 3) Aggregation für Bericht.
  let minDate: string | null = null;
  let maxDate: string | null = null;
  const byStaff = new Map<string, number>();
  for (const r of rows) {
    if (!minDate || r.business_date < minDate) minDate = r.business_date;
    if (!maxDate || r.business_date > maxDate) maxDate = r.business_date;
    byStaff.set(r.staff_id, (byStaff.get(r.staff_id) ?? 0) + 1);
  }

  const nameById = new Map<string, string>();
  if (byStaff.size > 0) {
    const { data: staffRows, error: sErr } = await admin
      .from("staff")
      .select("id, display_name")
      .in("id", Array.from(byStaff.keys()));
    if (sErr) throw sErr;
    for (const s of staffRows ?? []) nameById.set(s.id, s.display_name ?? s.id);
  }
  const staffGroups: DeleteImportedStaffGroup[] = Array.from(byStaff.entries())
    .map(([id, count]) => ({
      staffId: id,
      staffName: nameById.get(id) ?? id,
      shiftCount: count,
    }))
    .sort((a, b) => b.shiftCount - a.shiftCount);

  // 4) Commit: in Batches löschen, immer mit source='import'-Backstop in der
  //    WHERE-Klausel — auch wenn die ids selektiert wurden, schützt das vor
  //    Race-Conditions/Falscheingaben (defense in depth).
  let totalDeleted = 0;
  if (mode === "commit" && rows.length > 0) {
    const ids = rows.map((r) => r.id);
    for (let i = 0; i < ids.length; i += DELETE_BATCH_SIZE) {
      const slice = ids.slice(i, i + DELETE_BATCH_SIZE);
      const { data: del, error: delErr } = await admin
        .from("time_entries")
        .delete()
        .in("id", slice)
        .eq("organization_id", organizationId)
        .eq("source", "import")
        .select("id");
      if (delErr) throw delErr;
      totalDeleted += del?.length ?? 0;
    }
  }

  return {
    mode,
    totalMatched: rows.length,
    totalDeleted,
    minBusinessDate: minDate,
    maxBusinessDate: maxDate,
    staffGroups,
    filter: { staffId: staffId ?? null },
  };
}
