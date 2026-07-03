// Reine Unit-Tests fuer die Zod-Validierung und die serverseitige
// Re-Validierung der Konsistenz-Gates in replaceBilanzYear. Die
// eigentliche Server-Function wird per DB-Test in F4b/E2E abgedeckt.

import { describe, expect, it } from "vitest";
import { replaceBilanzYearInput, validateReplacePayload } from "./bilanz.functions";

describe("replaceBilanzYearInput (Zod)", () => {
  it("weist Payload ohne Positionen ab", () => {
    const r = replaceBilanzYearInput.safeParse({
      entity: "YUM",
      fiscalYear: 2024,
      positions: [],
      konten: [],
    });
    expect(r.success).toBe(false);
  });

  it("weist ungueltiges statement ab", () => {
    const r = replaceBilanzYearInput.safeParse({
      entity: "YUM",
      fiscalYear: 2024,
      positions: [
        {
          statement: "sonst",
          code: "A",
          parentCode: null,
          label: "X",
          level: 0,
          sortOrder: 0,
          betragCents: 100,
          vorjahrCents: null,
        },
      ],
      konten: [],
    });
    expect(r.success).toBe(false);
  });
});

function baseValidPayload() {
  return {
    entity: "YUM",
    fiscalYear: 2024,
    positions: [
      {
        statement: "aktiva" as const,
        code: "A",
        parentCode: null,
        label: "AV",
        level: 0,
        sortOrder: 0,
        betragCents: 1000,
        vorjahrCents: null,
        source: "pdf" as const,
      },
      {
        statement: "passiva" as const,
        code: "B",
        parentCode: null,
        label: "EK",
        level: 0,
        sortOrder: 1,
        betragCents: 1000,
        vorjahrCents: null,
        source: "pdf" as const,
      },
      {
        statement: "guv" as const,
        code: "guv.1",
        parentCode: null,
        label: "Umsatz",
        level: 0,
        sortOrder: 2,
        betragCents: 5000,
        vorjahrCents: null,
        source: "pdf" as const,
      },
      {
        statement: "guv" as const,
        code: "guv.2",
        parentCode: null,
        label: "Aufwand",
        level: 0,
        sortOrder: 3,
        betragCents: -2000,
        vorjahrCents: null,
        source: "pdf" as const,
      },
      {
        statement: "guv" as const,
        code: "guv.3",
        parentCode: null,
        label: "Ergebnis",
        level: 0,
        sortOrder: 4,
        betragCents: 3000,
        vorjahrCents: null,
        source: "pdf" as const,
      },
    ],
    konten: [
      {
        statement: "aktiva" as const,
        positionCode: "A",
        kontoNr: "0300",
        label: "Grund",
        betragCents: 1000,
        vorjahrCents: null,
        sortOrder: 0,
      },
      {
        statement: "passiva" as const,
        positionCode: "B",
        kontoNr: "0800",
        label: "EK",
        betragCents: 1000,
        vorjahrCents: null,
        sortOrder: 1,
      },
    ],
  };
}

describe("validateReplacePayload (server-seitige Gates)", () => {
  it("gueltige Payload passiert alle Gates", () => {
    const r = validateReplacePayload(baseValidPayload());
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("Gate 1: Konten-Summe ≠ Position → error", () => {
    const p = baseValidPayload();
    p.konten[0].betragCents = 900;
    const r = validateReplacePayload(p);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/Konten-Summe fuer aktiva:A/);
  });

  it("Gate 2: Aktiva ≠ Passiva → error", () => {
    const p = baseValidPayload();
    p.positions[1].betragCents = 1100;
    p.konten[1].betragCents = 1100;
    const r = validateReplacePayload(p);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/Bilanzsumme/);
  });

  it("Gate 3: GuV-Staffelbruch → error", () => {
    const p = baseValidPayload();
    p.positions[4].betragCents = 4000;
    const r = validateReplacePayload(p);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/GuV-Staffel/);
  });
});
