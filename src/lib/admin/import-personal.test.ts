// Unit-Tests für das reine Personal-Mapping-Modul.
import { describe, it, expect } from "vitest";
import {
  computePersonalPlan,
  type CurrentStaffRow,
  type PersonalRowInput,
} from "./import-personal";
import { parsePersonalCsv } from "./import-personal-csv";

const STAFF_A = "staff-a";
const STAFF_B = "staff-b";
const FALLBACK = "2026-06-14";

function rows(overrides: Partial<PersonalRowInput> = {}): PersonalRowInput[] {
  return [
    {
      altStaffId: "alt-a",
      firstName: "Phattanaphol (ANDI)",
      lastName: "Sukphasathit",
      nickname: "ANDI",
      persoNr: 42,
      hourlyRate: 16.5,
      employmentStart: "2024-01-15",
      ...overrides,
    },
  ];
}

function staffMap(): Map<string, string> {
  return new Map([
    ["alt-a", STAFF_A],
    ["alt-b", STAFF_B],
  ]);
}

describe("computePersonalPlan — Namen + perso_nr", () => {
  it("(a) Klammer-Spitzname bleibt im first_name erhalten", () => {
    const current = new Map<string, CurrentStaffRow>([
      [
        STAFF_A,
        {
          staffId: STAFF_A,
          firstName: "Andi",
          lastName: "Sukphasathit",
          displayName: "ANDI",
          persoNr: 42,
        },
      ],
    ]);
    const r = computePersonalPlan({
      rows: rows(),
      staffMap: staffMap(),
      currentStaff: current,
      currentComp: new Map([
        [STAFF_A, { staffId: STAFF_A, hourlyRate: 16.5, validFrom: "2024-01-15" }],
      ]),
      fallbackValidFrom: FALLBACK,
    });
    expect(r.staffUpdates).toHaveLength(1);
    expect(r.staffUpdates[0].fields.first_name).toBe("Phattanaphol (ANDI)");
    // Keine display_name-Änderung (nickname identisch).
    expect(r.staffUpdates[0].fields.display_name).toBeUndefined();
  });

  it("display_name wird NICHT überschrieben, wenn nickname im CSV leer ist", () => {
    const current = new Map<string, CurrentStaffRow>([
      [
        STAFF_A,
        {
          staffId: STAFF_A,
          firstName: "Phattanaphol (ANDI)",
          lastName: "Sukphasathit",
          displayName: "BestehenderName",
          persoNr: 42,
        },
      ],
    ]);
    const r = computePersonalPlan({
      rows: rows({ nickname: "" }),
      staffMap: staffMap(),
      currentStaff: current,
      currentComp: new Map([
        [STAFF_A, { staffId: STAFF_A, hourlyRate: 16.5, validFrom: "2024-01-15" }],
      ]),
      fallbackValidFrom: FALLBACK,
    });
    // Kein staff-Update überhaupt (alles identisch + nickname-Schutz).
    expect(r.staffUpdates).toHaveLength(0);
    expect(r.totals.nameUpdates).toBe(0);
  });

  it("perso_nr leer im CSV → bestehender Wert wird NICHT überschrieben", () => {
    const current = new Map<string, CurrentStaffRow>([
      [
        STAFF_A,
        {
          staffId: STAFF_A,
          firstName: "Phattanaphol (ANDI)",
          lastName: "Sukphasathit",
          displayName: "ANDI",
          persoNr: 1234, // bestehender Wert
        },
      ],
    ]);
    const r = computePersonalPlan({
      rows: rows({ persoNr: null }),
      staffMap: staffMap(),
      currentStaff: current,
      currentComp: new Map([
        [STAFF_A, { staffId: STAFF_A, hourlyRate: 16.5, validFrom: "2024-01-15" }],
      ]),
      fallbackValidFrom: FALLBACK,
    });
    expect(r.staffUpdates).toHaveLength(0);
    expect(r.perStaff[0].nameDiff.perso_nr).toBeUndefined();
  });
});

describe("computePersonalPlan — Compensation", () => {
  it("(b) hourly_rate=0 wird als Insert geschrieben, nicht geskippt", () => {
    const current = new Map<string, CurrentStaffRow>([
      [
        STAFF_A,
        {
          staffId: STAFF_A,
          firstName: "Net",
          lastName: "Net",
          displayName: "NET",
          persoNr: null,
        },
      ],
    ]);
    const r = computePersonalPlan({
      rows: rows({
        firstName: "Net",
        lastName: "Net",
        nickname: "NET",
        persoNr: null,
        hourlyRate: 0,
        employmentStart: null,
      }),
      staffMap: staffMap(),
      currentStaff: current,
      currentComp: new Map(),
      fallbackValidFrom: FALLBACK,
    });
    expect(r.totals.compInserts).toBe(1);
    expect(r.compOps[0].op).toBe("insert");
    expect(r.compOps[0].hourly_rate).toBe(0);
  });

  it("(c) employmentStart leer → compFallback=true, valid_from=fallback", () => {
    const r = computePersonalPlan({
      rows: rows({ employmentStart: null }),
      staffMap: staffMap(),
      currentStaff: new Map([
        [
          STAFF_A,
          {
            staffId: STAFF_A,
            firstName: "Phattanaphol (ANDI)",
            lastName: "Sukphasathit",
            displayName: "ANDI",
            persoNr: 42,
          },
        ],
      ]),
      currentComp: new Map(),
      fallbackValidFrom: FALLBACK,
    });
    expect(r.compOps[0].valid_from).toBe(FALLBACK);
    expect(r.compOps[0].fallback).toBe(true);
    expect(r.perStaff[0].compFallback).toBe(true);
    expect(r.totals.compFallbacks).toBe(1);
  });

  it("comp-UPSERT: bestehender Eintrag mit geändertem Lohn → update", () => {
    const r = computePersonalPlan({
      rows: rows({ hourlyRate: 18.0 }),
      staffMap: staffMap(),
      currentStaff: new Map([
        [
          STAFF_A,
          {
            staffId: STAFF_A,
            firstName: "Phattanaphol (ANDI)",
            lastName: "Sukphasathit",
            displayName: "ANDI",
            persoNr: 42,
          },
        ],
      ]),
      currentComp: new Map([
        [STAFF_A, { staffId: STAFF_A, hourlyRate: 16.5, validFrom: "2024-01-15" }],
      ]),
      fallbackValidFrom: FALLBACK,
    });
    expect(r.totals.compUpdates).toBe(1);
    expect(r.compOps[0].op).toBe("update");
    expect(r.compOps[0].hourly_rate).toBe(18.0);
  });

  it("(e) Idempotenz: identische Eingabe + identischer Bestand = 0 Ops", () => {
    const r = computePersonalPlan({
      rows: rows(),
      staffMap: staffMap(),
      currentStaff: new Map([
        [
          STAFF_A,
          {
            staffId: STAFF_A,
            firstName: "Phattanaphol (ANDI)",
            lastName: "Sukphasathit",
            displayName: "ANDI",
            persoNr: 42,
          },
        ],
      ]),
      currentComp: new Map([
        [STAFF_A, { staffId: STAFF_A, hourlyRate: 16.5, validFrom: "2024-01-15" }],
      ]),
      fallbackValidFrom: FALLBACK,
    });
    expect(r.totals.nameUpdates).toBe(0);
    expect(r.totals.compInserts).toBe(0);
    expect(r.totals.compUpdates).toBe(0);
  });
});

describe("computePersonalPlan — Skips", () => {
  it("(d) unbekannte altStaffId → skippedRows mit reason=unknown_alt_staff", () => {
    const r = computePersonalPlan({
      rows: rows({ altStaffId: "alt-geist" }),
      staffMap: staffMap(),
      currentStaff: new Map(),
      currentComp: new Map(),
      fallbackValidFrom: FALLBACK,
    });
    expect(r.totals.skippedCount).toBe(1);
    expect(r.skippedRows[0].reason).toBe("unknown_alt_staff");
    expect(r.perStaff).toHaveLength(0);
    expect(r.staffUpdates).toHaveLength(0);
    expect(r.compOps).toHaveLength(0);
  });
});

describe("parsePersonalCsv", () => {
  it("behält Klammer-Spitzname in first_name", () => {
    const csv =
      "alt_staff_id;first_name;last_name;nickname;perso_nr;hourly_rate;employment_start\n" +
      "alt-1;Phattanaphol (ANDI);Sukphasathit;ANDI;42;16,5;2024-01-15";
    const r = parsePersonalCsv(csv);
    expect(r.warnings).toEqual([]);
    expect(r.rows[0].firstName).toBe("Phattanaphol (ANDI)");
    expect(r.rows[0].hourlyRate).toBe(16.5);
    expect(r.rows[0].employmentStart).toBe("2024-01-15");
  });

  it("akzeptiert leeres employment_start (Fallback greift später)", () => {
    const csv =
      "alt_staff_id;first_name;last_name;nickname;perso_nr;hourly_rate;employment_start\n" +
      "alt-net;Net;Net;NET;;0;";
    const r = parsePersonalCsv(csv);
    expect(r.warnings).toEqual([]);
    expect(r.rows[0].employmentStart).toBeNull();
    expect(r.rows[0].hourlyRate).toBe(0);
    expect(r.rows[0].persoNr).toBeNull();
  });

  it("warnt bei leerem hourly_rate und überspringt die Zeile", () => {
    const csv =
      "alt_staff_id;first_name;last_name;nickname;perso_nr;hourly_rate;employment_start\n" +
      "alt-x;X;Y;;;;2024-01-01";
    const r = parsePersonalCsv(csv);
    expect(r.rows).toHaveLength(0);
    expect(r.warnings[0].kind).toBe("invalid_number");
  });
});
