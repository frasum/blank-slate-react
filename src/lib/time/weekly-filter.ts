// Z4 — Reiner Anzeige-Filter für den Wochenplan-Tab.
//
// Filtert `rowsByDept` nach Bereich (Abteilung), Skill und Suchbegriff
// (UND-Verknüpfung). Sektionen ohne verbleibende Zeilen werden entfernt.
// Ausschließlich Anzeige — Aggregation, Attribution, Server-Schreibpfade
// und die XLSX/PDF-Exporte bleiben unverändert vollständig.

import type { WeeklyExportInput, WeeklyExportRow } from "./weekly-export";

export type WeeklyDepartment = "kitchen" | "service" | "gl";

export type WeeklyFilter = {
  dept: WeeklyDepartment | "all";
  skillId: string | "all";
  query: string;
};

export function filterWeeklyRows(
  rowsByDept: WeeklyExportInput["rowsByDept"],
  filter: WeeklyFilter,
  skillsByStaff: Map<string, string[]> = new Map(),
): WeeklyExportInput["rowsByDept"] {
  const q = filter.query.trim().toLowerCase();
  const matchDept = (dept: WeeklyDepartment) => filter.dept === "all" || filter.dept === dept;
  const matchSkill = (staffId: string) => {
    if (filter.skillId === "all") return true;
    return (skillsByStaff.get(staffId) ?? []).includes(filter.skillId);
  };
  const matchQuery = (row: WeeklyExportRow) =>
    q === "" || row.displayName.toLowerCase().includes(q);

  return rowsByDept
    .filter((g) => matchDept(g.dept))
    .map((g) => ({
      ...g,
      rows: g.rows.filter((r) => matchSkill(r.staffId) && matchQuery(r)),
    }))
    .filter((g) => g.rows.length > 0);
}
