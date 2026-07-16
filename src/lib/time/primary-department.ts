// Z2 — deterministische Primär-Abteilung eines Mitarbeiters am Standort.
//
// time_entries hat KEINE Abteilungs-Dimension: die Stunden einer Person
// laufen daher immer auf genau EINER Zeile auf. Damit dieselbe Person nicht
// je nach Row-Reihenfolge einmal unter KÜCHE, einmal unter GL landet, wird
// die Primär-Abteilung aus den staff_locations-Zuordnungen deterministisch
// gewählt.
//
// WZ1/KGL — Reihenfolge: gl > kitchen > service. Deckungsgleich mit der
// TP-GL-Hausregel in `src/lib/cash/roster-pool-snapshot.ts` (Franks
// Referenz-Regel für den Kassen-Pool). Vorher lief hier
// kitchen > service > gl — LAM (service+gl) erschien in der Zusammen-
// fassung nie unter Geschäftsleitung. Fallback (leere Liste): "service"
// — konsistent mit dem historischen Default in getTimeOverview /
// getWeeklyTimeEntries.

export type Department = "kitchen" | "service" | "gl";

const PRIORITY: Department[] = ["gl", "kitchen", "service"];

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
  opts?: { rosterArea?: Department | null },
): { department: Department; mismatched: boolean } {
  if (entryDept && staffDepts.includes(entryDept)) {
    return { department: entryDept, mismatched: false };
  }
  // W2 — GL-Personen-Ausnahme: Wer der GL zugeordnet ist, wird per
  // D-3-Hausregel im Dienstplan als Service eingeplant (GL ist kein
  // Planbereich). Ohne explizite Eintrags-Abteilung würde Z3b diese
  // Stempelungen sonst fälschlich in die SERVICE-Zeile routen. Bei
  // GL-Mitgliedern gewinnt daher IMMER die GL-Zeile — der Roster-
  // Service-Bereich ist bei ihnen ein Plan-Artefakt, keine Fach-
  // Aussage. Explizit gesetzte Eintrags-Abteilung (rawDepartment)
  // gewinnt weiterhin (siehe if oben) — das ist ab LG1 der Lohn-
  // Schalter pro Schicht.
  if (entryDept == null && staffDepts.includes("gl")) {
    return { department: "gl", mismatched: false };
  }
  // Z3b — Wenn kein Eintrags-Department gesetzt ist (Stempel/Batch/Pool/
  // Bestandsdaten), aber der Dienstplan an dem Tag eine passende Area
  // gefahren hat, schlägt die Roster-Realität die statische kitchen>
  // service>gl-Rangfolge. Verhindert, dass Mehrfach-Zuordnungen (z. B.
  // kitchen + service) Stunden fälschlich in die Küche kippen, obwohl die
  // Person laut Dienstplan Service war.
  if (entryDept == null && opts?.rosterArea && staffDepts.includes(opts.rosterArea)) {
    return { department: opts.rosterArea, mismatched: false };
  }
  return {
    department: primaryDepartment(staffDepts),
    mismatched: entryDept != null,
  };
}
