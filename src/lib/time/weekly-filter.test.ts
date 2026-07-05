import { describe, expect, it } from "vitest";
import { filterWeeklyRows, type RosterByStaff } from "./weekly-filter";
import type { WeeklyExportInput, WeeklyExportRow } from "./weekly-export";

function row(staffId: string, displayName: string): WeeklyExportRow {
  return {
    staffId,
    displayName,
    department: "kitchen",
    days: [],
    totals: { total: 0, evening: 0, night: 0, sunHol: 0 },
  };
}

// Z2-Grundmenge: alle Zugeordneten (auch ohne Schichten in dieser Woche).
// s1 MO: kitchen + gl zugeordnet, aber KEINE Schichten in der Woche.
// s2 LAM: kitchen + service zugeordnet.
// s3 EM: kitchen + gl zugeordnet.
// s4 ANN: service zugeordnet.
const rowsByDept: WeeklyExportInput["rowsByDept"] = [
  {
    dept: "kitchen",
    deptLabel: "KÜCHE",
    rows: [row("s1", "MO"), row("s2", "LAM"), row("s3", "EM")],
  },
  {
    dept: "service",
    deptLabel: "SERVICE",
    rows: [row("s2", "LAM"), row("s4", "ANN")],
  },
  {
    dept: "gl",
    deptLabel: "GESCHÄFTSLEITUNG",
    rows: [row("s1", "MO"), row("s3", "EM")],
  },
];

// Dienstplan der angezeigten Woche (Z4b):
// s2 LAM: kitchen-Schicht mit Skill SPÜLEN; service-Schicht mit Skill BAR.
// s3 EM:  kitchen-Schicht mit Skill PASS.
// s4 ANN: service-Schicht ohne Skill (skill_id null).
// s1 MO:  KEINE Schicht in dieser Woche.
const roster: RosterByStaff = new Map([
  ["s2", { areas: ["kitchen", "service"], skillIds: ["spuelen", "bar"] }],
  ["s3", { areas: ["kitchen"], skillIds: ["pass"] }],
  ["s4", { areas: ["service"], skillIds: [] }],
]);

describe("filterWeeklyRows", () => {
  it("Alle/Alle liefert die volle Grundmenge (auch Nicht-Eingeplante wie MO)", () => {
    const out = filterWeeklyRows(
      rowsByDept,
      { dept: "all", skillId: "all", query: "" },
      roster,
    );
    expect(out.map((g) => g.dept)).toEqual(["kitchen", "service", "gl"]);
    expect(out.find((g) => g.dept === "kitchen")!.rows.map((r) => r.staffId)).toEqual([
      "s1",
      "s2",
      "s3",
    ]);
    expect(out.find((g) => g.dept === "gl")!.rows.map((r) => r.staffId)).toEqual(["s1", "s3"]);
  });

  it("Bereichs-Filter (Küche): nur in dieser Woche als Küche Eingeplante — MO verschwindet", () => {
    const out = filterWeeklyRows(
      rowsByDept,
      { dept: "kitchen", skillId: "all", query: "" },
      roster,
    );
    expect(out).toHaveLength(1);
    expect(out[0].dept).toBe("kitchen");
    expect(out[0].rows.map((r) => r.staffId)).toEqual(["s2", "s3"]);
  });

  it("Skill-Filter (SPÜLEN): nur Personen mit einer Schicht mit skill_id=SPÜLEN diese Woche", () => {
    const out = filterWeeklyRows(
      rowsByDept,
      { dept: "all", skillId: "spuelen", query: "" },
      roster,
    );
    // Nur s2 (LAM) hat SPÜLEN eingeplant — erscheint überall, wo LAM zugeordnet ist.
    expect(out.map((g) => g.dept)).toEqual(["kitchen", "service"]);
    expect(out.every((g) => g.rows.every((r) => r.staffId === "s2"))).toBe(true);
  });

  it("Skill-Stammdaten reichen NICHT — nur die Dienstplan-Realität zählt (Frank-Fall)", () => {
    // s3 könnte SPÜLEN grundsätzlich, ist diese Woche aber mit PASS eingeplant → versteckt.
    // (roster.s3.skillIds enthält kein „spuelen" — Stammdaten sind hier bewusst nicht abgebildet.)
    const out = filterWeeklyRows(
      rowsByDept,
      { dept: "kitchen", skillId: "spuelen", query: "" },
      roster,
    );
    expect(out).toHaveLength(1);
    expect(out[0].rows.map((r) => r.staffId)).toEqual(["s2"]);
  });

  it("Schicht mit skill_id=null zählt für Bereichs-, nicht für Skill-Filter", () => {
    // s4 ANN hat eine service-Schicht ohne Skill.
    const bereich = filterWeeklyRows(
      rowsByDept,
      { dept: "service", skillId: "all", query: "" },
      roster,
    );
    expect(bereich[0].rows.map((r) => r.staffId)).toEqual(["s2", "s4"]);

    const skill = filterWeeklyRows(
      rowsByDept,
      { dept: "service", skillId: "bar", query: "" },
      roster,
    );
    // Nur s2 hat BAR eingeplant; s4 (skill_id null) fällt raus.
    expect(skill[0].rows.map((r) => r.staffId)).toEqual(["s2"]);
  });

  it("Bereich + Skill entkoppelt über die Woche (dürfen verschiedene Schichten sein)", () => {
    // s2 LAM: kitchen-Schicht mit SPÜLEN, service-Schicht mit BAR.
    // Filter „service + SPÜLEN": Bereich (service) via BAR-Schicht, Skill (SPÜLEN) via
    // Küchen-Schicht — beides in derselben Woche → LAM bleibt sichtbar.
    const out = filterWeeklyRows(
      rowsByDept,
      { dept: "service", skillId: "spuelen", query: "" },
      roster,
    );
    expect(out).toHaveLength(1);
    expect(out[0].rows.map((r) => r.staffId)).toEqual(["s2"]);
  });

  it("Suche kombiniert weiter per UND", () => {
    const out = filterWeeklyRows(
      rowsByDept,
      { dept: "all", skillId: "spuelen", query: "lam" },
      roster,
    );
    expect(out.every((g) => g.rows.every((r) => r.staffId === "s2"))).toBe(true);

    const empty = filterWeeklyRows(
      rowsByDept,
      { dept: "all", skillId: "spuelen", query: "mo" },
      roster,
    );
    // MO hat keine SPÜLEN-Schicht — nichts übrig.
    expect(empty).toEqual([]);
  });

  it("liefert eine leere Liste, wenn niemand die Kombi erfüllt", () => {
    const out = filterWeeklyRows(
      rowsByDept,
      { dept: "gl", skillId: "spuelen", query: "" },
      roster,
    );
    expect(out).toEqual([]);
  });
});
