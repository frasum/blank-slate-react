// Z2 — deterministische Primär-Abteilung eines Mitarbeiters am Standort.
//
// time_entries hat KEINE Abteilungs-Dimension: die Stunden einer Person
// laufen daher immer auf genau EINER Zeile auf. Damit dieselbe Person nicht
// je nach Row-Reihenfolge einmal unter KÜCHE, einmal unter GL landet, wird
// die Primär-Abteilung aus den staff_locations-Zuordnungen deterministisch
// gewählt: Fachbereich schlägt Geschäftsleitung, Küche schlägt Service.
//
// Reihenfolge: kitchen > service > gl. Fallback (leere Liste): "service"
// — konsistent mit dem historischen Default in getTimeOverview /
// getWeeklyTimeEntries.

export type Department = "kitchen" | "service" | "gl";

const PRIORITY: Department[] = ["kitchen", "service", "gl"];

export function primaryDepartment(depts: readonly Department[]): Department {
  for (const d of PRIORITY) {
    if (depts.includes(d)) return d;
  }
  return "service";
}

// Z3 — Zeilen-Attribution eines time_entries-Eintrags im Wochenplan.
//
// Regel:
//   * entryDept != null UND ∈ staffDepts → dieser Eintrag gehört zur Zeile
//     dieser Abteilung.
//   * entryDept == null → NULL-Fall (Stempel/Batch/Pool/Bestandsdaten) →
//     Anzeige auf der Primär-Zeile (kitchen > service > gl).
//   * entryDept != null aber NICHT in staffDepts → Person ist der
//     Abteilung am Standort (nicht mehr) zugeordnet: Anzeige auf der
//     Primär-Zeile + `mismatched: true` für Tooltip/Warnung. Kein
//     stilles Verschlucken.
export function entryRowDepartment(
  entryDept: Department | null | undefined,
  staffDepts: readonly Department[],
): { department: Department; mismatched: boolean } {
  if (entryDept && staffDepts.includes(entryDept)) {
    return { department: entryDept, mismatched: false };
  }
  return {
    department: primaryDepartment(staffDepts),
    mismatched: entryDept != null,
  };
}
