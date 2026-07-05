// Z4/Z4b — Reiner Anzeige-Filter für den Wochenplan-Tab.
//
// Filtert `rowsByDept` nach Bereich (Abteilung), Skill und Suchbegriff
// (UND-Verknüpfung). Sektionen ohne verbleibende Zeilen werden entfernt.
// Ausschließlich Anzeige — Aggregation, Attribution, Server-Schreibpfade
// und die XLSX/PDF-Exporte bleiben unverändert vollständig.
//
// Z4b: Bereich/Skill matchen gegen die **Dienstplan-Realität der
// angezeigten Woche** (`rosterByStaff`, aus `roster_shifts`), nicht
// gegen die Skill-Stammdaten. Damit zeigt „Küche · SPÜLEN" exakt die in
// dieser Woche mit SPÜLEN eingeplanten Personen — nicht jeden, der den
// Skill grundsätzlich könnte. `dept === "all"` UND `skillId === "all"`
// bleibt bewusst die volle Z2-Grundmenge (alle Zugeordneten, auch ohne
// Schichten), damit Eintragen für Nicht-Eingeplante möglich bleibt.
// Bereich + Skill kombiniert = **entkoppelt über die Woche** (Bereich
// erfüllt UND Skill erfüllt, je über irgendeine Schicht der Woche).

import type { WeeklyExportInput, WeeklyExportRow } from "./weekly-export";

export type WeeklyDepartment = "kitchen" | "service" | "gl";

export type WeeklyFilter = {
  dept: WeeklyDepartment | "all";
  skillId: string | "all";
  query: string;
};

/** Aggregierte Wochen-Schichten je Mitarbeiter (aus `roster_shifts`). */
export type RosterByStaff = Map<
  string,
  { areas: WeeklyDepartment[]; skillIds: string[] }
>;

export function filterWeeklyRows(
  rowsByDept: WeeklyExportInput["rowsByDept"],
  filter: WeeklyFilter,
  rosterByStaff: RosterByStaff = new Map(),
): WeeklyExportInput["rowsByDept"] {
  const q = filter.query.trim().toLowerCase();
  const deptActive = filter.dept !== "all";
  const skillActive = filter.skillId !== "all";

  const matchSectionDept = (dept: WeeklyDepartment) => !deptActive || filter.dept === dept;

  const matchRosterDept = (staffId: string) => {
    if (!deptActive) return true;
    return (rosterByStaff.get(staffId)?.areas ?? []).includes(filter.dept as WeeklyDepartment);
  };
  const matchRosterSkill = (staffId: string) => {
    if (!skillActive) return true;
    return (rosterByStaff.get(staffId)?.skillIds ?? []).includes(filter.skillId);
  };
  const matchQuery = (row: WeeklyExportRow) =>
    q === "" || row.displayName.toLowerCase().includes(q);

  return rowsByDept
    .filter((g) => matchSectionDept(g.dept))
    .map((g) => ({
      ...g,
      rows: g.rows.filter(
        (r) => matchRosterDept(r.staffId) && matchRosterSkill(r.staffId) && matchQuery(r),
      ),
    }))
    .filter((g) => g.rows.length > 0);
}
