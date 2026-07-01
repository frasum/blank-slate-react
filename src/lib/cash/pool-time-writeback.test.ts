import { describe, expect, it } from "vitest";
import {
  buildPoolTimeEntryRows,
  dropPoolWhenRealEntryExists,
  poolLocalTimeToIso,
  resolvePoolTimeEntrySync,
  type PoolWritebackInput,
} from "./pool-time-writeback";

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

describe("poolLocalTimeToIso", () => {
  it("Winter (CET = UTC+1): 15:00 lokal → 14:00 UTC", () => {
    const iso = poolLocalTimeToIso("2026-01-15", "15:00", 0);
    expect(iso).toBe("2026-01-15T14:00:00.000Z");
  });
  it("Sommer (CEST = UTC+2): 15:00 lokal → 13:00 UTC", () => {
    const iso = poolLocalTimeToIso("2026-07-15", "15:00", 0);
    expect(iso).toBe("2026-07-15T13:00:00.000Z");
  });
  it("Mitternachts-Wrap: dayOffset=1 nimmt Folgetag", () => {
    const iso = poolLocalTimeToIso("2026-07-15", "02:00", 1);
    // 16. Juli 02:00 CEST = 00:00 UTC
    expect(iso).toBe("2026-07-16T00:00:00.000Z");
  });
  it("DST-Wechsel März: 02:00 lokal am 29.03.2026 (Folgetag des 28.) — Sommerzeit", () => {
    // 28.03.2026 → Folgetag 29.03., dort gilt CEST (+02:00)
    const iso = poolLocalTimeToIso("2026-03-28", "03:00", 1);
    expect(iso).toBe("2026-03-29T01:00:00.000Z");
  });
  it("DST-Wechsel Oktober: Folgetag 26.10.2026 ist Winterzeit (+01:00)", () => {
    const iso = poolLocalTimeToIso("2026-10-25", "03:00", 1);
    expect(iso).toBe("2026-10-26T02:00:00.000Z");
  });
});

describe("dropPoolWhenRealEntryExists", () => {
  it("Tag mit clock+pool → pool raus, clock bleibt", () => {
    const out = dropPoolWhenRealEntryExists([
      { businessDate: "2026-06-30", source: "clock" },
      { businessDate: "2026-06-30", source: "pool" },
    ]);
    expect(out).toEqual([{ businessDate: "2026-06-30", source: "clock" }]);
  });
  it("Tag mit nur pool → bleibt", () => {
    const out = dropPoolWhenRealEntryExists([{ businessDate: "2026-06-30", source: "pool" }]);
    expect(out).toHaveLength(1);
  });
  it("import+pool → pool raus", () => {
    const out = dropPoolWhenRealEntryExists([
      { businessDate: "2026-06-30", source: "import" },
      { businessDate: "2026-06-30", source: "pool" },
    ]);
    expect(out.map((r) => r.source)).toEqual(["import"]);
  });
  it("manual+pool → pool raus", () => {
    const out = dropPoolWhenRealEntryExists([
      { businessDate: "2026-06-30", source: "manual" },
      { businessDate: "2026-06-30", source: "pool" },
    ]);
    expect(out.map((r) => r.source)).toEqual(["manual"]);
  });
  it("mehrere Tage gemischt: nur Tage mit real-Eintrag verwerfen pool", () => {
    const out = dropPoolWhenRealEntryExists([
      { businessDate: "2026-06-29", source: "pool" },
      { businessDate: "2026-06-30", source: "clock" },
      { businessDate: "2026-06-30", source: "pool" },
      { businessDate: "2026-07-01", source: "pool" },
    ]);
    expect(out).toEqual([
      { businessDate: "2026-06-29", source: "pool" },
      { businessDate: "2026-06-30", source: "clock" },
      { businessDate: "2026-07-01", source: "pool" },
    ]);
  });
});

describe("resolvePoolTimeEntrySync", () => {
  it("realer Stempel gewinnt → delete", () => {
    expect(
      resolvePoolTimeEntrySync({
        shiftStart: "16:00",
        shiftEnd: "23:00",
        department: "service",
        hasRealEntry: true,
      }),
    ).toEqual({ action: "delete" });
  });

  it("Zeit unvollständig → delete", () => {
    expect(
      resolvePoolTimeEntrySync({
        shiftStart: null,
        shiftEnd: "23:00",
        department: "kitchen",
        hasRealEntry: false,
      }),
    ).toEqual({ action: "delete" });
    expect(
      resolvePoolTimeEntrySync({
        shiftStart: "16:00",
        shiftEnd: null,
        department: "kitchen",
        hasRealEntry: false,
      }),
    ).toEqual({ action: "delete" });
  });

  it("Start == Ende → delete (keine 0-Dauer)", () => {
    expect(
      resolvePoolTimeEntrySync({
        shiftStart: "16:00",
        shiftEnd: "16:00",
        department: "service",
        hasRealEntry: false,
      }),
    ).toEqual({ action: "delete" });
  });

  it("normale Zeit → upsert mit minutes/crossesMidnight=false", () => {
    const r = resolvePoolTimeEntrySync({
      shiftStart: "16:00",
      shiftEnd: "23:30",
      department: "service",
      hasRealEntry: false,
    });
    expect(r).toEqual({
      action: "upsert",
      startTime: "16:00",
      endTime: "23:30",
      crossesMidnight: false,
      minutes: 450,
    });
  });

  it("Wrap: shiftEnd < shiftStart → crossesMidnight=true", () => {
    const r = resolvePoolTimeEntrySync({
      shiftStart: "18:00",
      shiftEnd: "02:00",
      department: "kitchen",
      hasRealEntry: false,
    });
    expect(r).toEqual({
      action: "upsert",
      startTime: "18:00",
      endTime: "02:00",
      crossesMidnight: true,
      minutes: 480,
    });
  });

  it("normalisiert 'HH:MM:SS' aus Postgres time", () => {
    const r = resolvePoolTimeEntrySync({
      shiftStart: "15:00:00",
      shiftEnd: "23:30:00",
      department: "kitchen",
      hasRealEntry: false,
    });
    expect(r.action).toBe("upsert");
    if (r.action === "upsert") {
      expect(r.startTime).toBe("15:00");
      expect(r.endTime).toBe("23:30");
    }
  });
});

// Ende-vor-Anfang-Fälle (Mitternachts-Wrap): das gesamte Zusammenspiel
// von resolvePoolTimeEntrySync + poolLocalTimeToIso muss started_at auf
// den Business-Tag und ended_at auf den Folgetag legen — DST-korrekt.
describe("Pool-Zeit-Wrap: shiftEnd < shiftStart", () => {
  it("Sommer-Wrap (CEST): 22:00 → 02:00 ergibt korrekte UTC-Timestamps", () => {
    const r = resolvePoolTimeEntrySync({
      shiftStart: "22:00",
      shiftEnd: "02:00",
      department: "service",
      hasRealEntry: false,
    });
    expect(r).toEqual({
      action: "upsert",
      startTime: "22:00",
      endTime: "02:00",
      crossesMidnight: true,
      minutes: 240,
    });
    if (r.action !== "upsert") throw new Error("unreachable");
    const startedAt = poolLocalTimeToIso("2026-07-15", r.startTime, 0);
    const endedAt = poolLocalTimeToIso("2026-07-15", r.endTime, r.crossesMidnight ? 1 : 0);
    // 15.07. 22:00 CEST → 20:00 UTC; 16.07. 02:00 CEST → 00:00 UTC
    expect(startedAt).toBe("2026-07-15T20:00:00.000Z");
    expect(endedAt).toBe("2026-07-16T00:00:00.000Z");
    expect(new Date(endedAt).getTime() - new Date(startedAt).getTime()).toBe(r.minutes * 60_000);
  });

  it("Winter-Wrap (CET): 23:30 → 00:30 legt Ende auf Folgetag", () => {
    const r = resolvePoolTimeEntrySync({
      shiftStart: "23:30",
      shiftEnd: "00:30",
      department: "kitchen",
      hasRealEntry: false,
    });
    expect(r).toMatchObject({ action: "upsert", crossesMidnight: true, minutes: 60 });
    if (r.action !== "upsert") throw new Error("unreachable");
    const startedAt = poolLocalTimeToIso("2026-01-15", r.startTime, 0);
    const endedAt = poolLocalTimeToIso("2026-01-15", r.endTime, r.crossesMidnight ? 1 : 0);
    // 15.01. 23:30 CET → 22:30 UTC; 16.01. 00:30 CET → 23:30 UTC (Vortag)
    expect(startedAt).toBe("2026-01-15T22:30:00.000Z");
    expect(endedAt).toBe("2026-01-15T23:30:00.000Z");
    expect(new Date(endedAt).getTime()).toBeGreaterThan(new Date(startedAt).getTime());
  });

  it("HH:MM:SS-Wrap: 23:00:00 → 05:00:00 normalisiert & wickelt um", () => {
    const r = resolvePoolTimeEntrySync({
      shiftStart: "23:00:00",
      shiftEnd: "05:00:00",
      department: "kitchen",
      hasRealEntry: false,
    });
    expect(r).toEqual({
      action: "upsert",
      startTime: "23:00",
      endTime: "05:00",
      crossesMidnight: true,
      minutes: 360,
    });
  });

  it("DST-Wrap Ende März: Business-Tag 28.03. → Ende auf 29.03. (CEST)", () => {
    const r = resolvePoolTimeEntrySync({
      shiftStart: "22:00",
      shiftEnd: "04:00",
      department: "service",
      hasRealEntry: false,
    });
    if (r.action !== "upsert") throw new Error("unreachable");
    const startedAt = poolLocalTimeToIso("2026-03-28", r.startTime, 0);
    const endedAt = poolLocalTimeToIso("2026-03-28", r.endTime, 1);
    // 28.03. 22:00 CET (+01) → 21:00 UTC; 29.03. 04:00 CEST (+02) → 02:00 UTC
    expect(startedAt).toBe("2026-03-28T21:00:00.000Z");
    expect(endedAt).toBe("2026-03-29T02:00:00.000Z");
  });

  it("DST-Wrap Ende Oktober: Folgetag 26.10. gilt Winterzeit (+01:00)", () => {
    const r = resolvePoolTimeEntrySync({
      shiftStart: "22:00",
      shiftEnd: "04:00",
      department: "service",
      hasRealEntry: false,
    });
    if (r.action !== "upsert") throw new Error("unreachable");
    const startedAt = poolLocalTimeToIso("2026-10-25", r.startTime, 0);
    const endedAt = poolLocalTimeToIso("2026-10-25", r.endTime, 1);
    // Anchor per Tag: 25.10. wird bereits als CET (+01) angesehen
    // (DST-Ende am 25.10. 03:00 CEST→02:00 CET), 26.10. ebenfalls CET.
    // 25.10. 22:00 CET (+01) → 21:00 UTC; 26.10. 04:00 CET (+01) → 03:00 UTC
    expect(startedAt).toBe("2026-10-25T21:00:00.000Z");
    expect(endedAt).toBe("2026-10-26T03:00:00.000Z");
  });

  it("Monats-/Jahreswechsel: 31.12. 23:00 → 01.01. 01:00", () => {
    const startedAt = poolLocalTimeToIso("2026-12-31", "23:00", 0);
    const endedAt = poolLocalTimeToIso("2026-12-31", "01:00", 1);
    expect(startedAt).toBe("2026-12-31T22:00:00.000Z");
    expect(endedAt).toBe("2027-01-01T00:00:00.000Z");
  });

  it("buildPoolTimeEntryRows-Wrap: crossesMidnight + startTime/endTime konsistent", () => {
    const rows = buildPoolTimeEntryRows(
      base({
        businessDate: "2026-07-15",
        poolEntries: [
          {
            id: "wrap",
            staffId: "sw",
            department: "service",
            shiftStart: "22:00",
            shiftEnd: "02:00",
          },
        ],
      }),
    );
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.crossesMidnight).toBe(true);
    const startedAt = poolLocalTimeToIso(row.businessDate, row.startTime, 0);
    const endedAt = poolLocalTimeToIso(row.businessDate, row.endTime, row.crossesMidnight ? 1 : 0);
    expect(new Date(endedAt).getTime()).toBeGreaterThan(new Date(startedAt).getTime());
    expect((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60_000).toBe(240);
  });
});
