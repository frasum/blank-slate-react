// Reine Funktion: erzeugt aus den BESTÄTIGTEN Dienstplan-Schichten eines
// Geschäftstags + den standort-spezifischen Standardzeiten einen Snapshot
// für `session_tip_pool_entries`. Wird bei der Eröffnung einer Session
// einmalig in die DB geschrieben (Idempotenz über
// `on conflict (session_id, staff_id) do nothing`) — spätere
// Plan-Änderungen wirken NICHT mehr.
//
// Regeln:
//   * Bereichs-Priorität pro Mitarbeiter: kitchen > service > gl.
//     Mehrfacheinteilung ergibt also genau eine Zeile.
//   * Küche/Service: shift_start/shift_end aus
//     location_department_defaults; hours_minutes via kitchenShiftMinutes.
//     Fehlt das Default oder ist es unvollständig → null/null/0.
//   * GL: department='gl', shift_start=null, shift_end=null,
//     hours_minutes=0. GL bekommt nie Trinkgeld; der Eintrag dient nur als
//     Arbeitszeit-Anker. Frank trägt Zeiten bei Bedarf manuell nach.
//
// Hinweis: `session_tip_pool_entries` trägt damit bewusst auch
// Nicht-Trinkgeld-Arbeitszeit (GL). Der Verteil-Algorithmus
// (`computeTipPool`) ignoriert alles außer kitchen/service über
// `staffDepartments`.

import { kitchenShiftMinutes } from "./kitchen-shift-hours";
import type { StaffDepartment } from "@/lib/staff-domain";

export type RosterShiftInput = {
  staffId: string;
  area: StaffDepartment;
};

export type DefaultsByArea = Partial<
  Record<"kitchen" | "service", { checkin: string | null; checkout: string | null }>
>;

export type SnapshotEntry = {
  staffId: string;
  department: StaffDepartment;
  shiftStart: string | null;
  shiftEnd: string | null;
  hoursMinutes: number;
};

const PRIORITY: Record<StaffDepartment, number> = {
  kitchen: 3,
  service: 2,
  gl: 1,
};

export function buildRosterPoolSnapshot(input: {
  rosterShifts: RosterShiftInput[];
  defaultsByArea: DefaultsByArea;
}): SnapshotEntry[] {
  // Pro Mitarbeiter höchste Priorität (kitchen > service > gl) gewinnt.
  const winner = new Map<string, StaffDepartment>();
  for (const s of input.rosterShifts) {
    const prev = winner.get(s.staffId);
    if (!prev || PRIORITY[s.area] > PRIORITY[prev]) {
      winner.set(s.staffId, s.area);
    }
  }

  const out: SnapshotEntry[] = [];
  for (const [staffId, dept] of winner) {
    if (dept === "gl") {
      out.push({
        staffId,
        department: "gl",
        shiftStart: null,
        shiftEnd: null,
        hoursMinutes: 0,
      });
      continue;
    }
    const def = input.defaultsByArea[dept];
    const checkin = def?.checkin ?? null;
    const checkout = def?.checkout ?? null;
    if (!checkin || !checkout) {
      out.push({
        staffId,
        department: dept,
        shiftStart: null,
        shiftEnd: null,
        hoursMinutes: 0,
      });
      continue;
    }
    // Defaults kommen als "HH:MM" oder "HH:MM:SS" aus Postgres `time`.
    const start = checkin.slice(0, 5);
    const end = checkout.slice(0, 5);
    let minutes = 0;
    try {
      minutes = kitchenShiftMinutes(start, end);
    } catch {
      minutes = 0;
    }
    out.push({
      staffId,
      department: dept,
      shiftStart: start,
      shiftEnd: end,
      hoursMinutes: minutes,
    });
  }
  return out;
}
