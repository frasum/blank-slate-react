import { describe, expect, it } from "vitest";
import { buildPoolTimeEntryRows, type PoolWritebackInput } from "./pool-time-writeback";

function base(overrides: Partial<PoolWritebackInput> = {}): PoolWritebackInput {
  return {
    poolEntries: [],
    businessDate: "2026-06-30",
    organizationId: "org-1",
    locationId: "loc-1",
    staffWithRealEntry: new Set(),
    ...overrides,
  };
}

describe("buildPoolTimeEntryRows", () => {
  it("überspringt Staff mit echtem clock/manual-Eintrag am selben Tag", () => {
    const rows = buildPoolTimeEntryRows(
      base({
        poolEntries: [
          {
            id: "p1",
            staffId: "s1",
            department: "service",
            shiftStart: "16:00",
            shiftEnd: "23:00",
          },
        ],
        staffWithRealEntry: new Set(["s1"]),
      }),
    );
    expect(rows).toEqual([]);
  });

  it("Pool-Eintrag ohne clock → Row mit korrekten Feldern", () => {
    const rows = buildPoolTimeEntryRows(
      base({
        poolEntries: [
          {
            id: "p2",
            staffId: "s2",
            department: "kitchen",
            shiftStart: "15:00",
            shiftEnd: "23:30",
          },
        ],
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      organizationId: "org-1",
      staffId: "s2",
      businessDate: "2026-06-30",
      startTime: "15:00",
      endTime: "23:30",
      crossesMidnight: false,
      breakMinutes: 0,
      locationId: "loc-1",
      source: "pool",
      importKey: "pool:p2",
    });
  });

  it("GL mit Zeit → Row; GL ohne Zeit → keine Row", () => {
    const rows = buildPoolTimeEntryRows(
      base({
        poolEntries: [
          {
            id: "g1",
            staffId: "gl-with",
            department: "gl",
            shiftStart: "10:00",
            shiftEnd: "14:00",
          },
          {
            id: "g2",
            staffId: "gl-without",
            department: "gl",
            shiftStart: null,
            shiftEnd: null,
          },
        ],
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].staffId).toBe("gl-with");
  });

  it("Küche & Service werden gleich behandelt (department egal)", () => {
    const rows = buildPoolTimeEntryRows(
      base({
        poolEntries: [
          {
            id: "k",
            staffId: "sk",
            department: "kitchen",
            shiftStart: "15:00",
            shiftEnd: "22:00",
          },
          {
            id: "s",
            staffId: "ss",
            department: "service",
            shiftStart: "16:00",
            shiftEnd: "23:00",
          },
        ],
      }),
    );
    expect(rows.map((r) => r.staffId).sort()).toEqual(["sk", "ss"]);
  });

  it("Mitternachts-Wrap: end < start → crossesMidnight=true", () => {
    const rows = buildPoolTimeEntryRows(
      base({
        poolEntries: [
          {
            id: "n",
            staffId: "sn",
            department: "service",
            shiftStart: "18:00",
            shiftEnd: "02:00",
          },
        ],
      }),
    );
    expect(rows[0].crossesMidnight).toBe(true);
  });

  it("startTime == endTime → keine Row", () => {
    const rows = buildPoolTimeEntryRows(
      base({
        poolEntries: [
          {
            id: "z",
            staffId: "sz",
            department: "kitchen",
            shiftStart: "12:00",
            shiftEnd: "12:00",
          },
        ],
      }),
    );
    expect(rows).toEqual([]);
  });

  it("normalisiert 'HH:MM:SS' aus Postgres time", () => {
    const rows = buildPoolTimeEntryRows(
      base({
        poolEntries: [
          {
            id: "t",
            staffId: "st",
            department: "kitchen",
            shiftStart: "15:00:00",
            shiftEnd: "23:30:00",
          },
        ],
      }),
    );
    expect(rows[0].startTime).toBe("15:00");
    expect(rows[0].endTime).toBe("23:30");
  });

  it("gemischte Liste: 3 MA → genau 1 Row", () => {
    const rows = buildPoolTimeEntryRows(
      base({
        poolEntries: [
          {
            id: "a",
            staffId: "stamper",
            department: "service",
            shiftStart: "16:00",
            shiftEnd: "23:00",
          },
          {
            id: "b",
            staffId: "kitchen-ok",
            department: "kitchen",
            shiftStart: "15:00",
            shiftEnd: "23:30",
          },
          {
            id: "c",
            staffId: "gl-empty",
            department: "gl",
            shiftStart: null,
            shiftEnd: null,
          },
        ],
        staffWithRealEntry: new Set(["stamper"]),
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].staffId).toBe("kitchen-ok");
    expect(rows[0].importKey).toBe("pool:b");
  });
});