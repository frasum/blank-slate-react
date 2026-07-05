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