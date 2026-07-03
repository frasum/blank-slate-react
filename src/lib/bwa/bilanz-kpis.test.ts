import { describe, expect, it } from "vitest";
import {
  bilanzsummeCents,
  deriveBilanzKpis,
  eigenkapitalCents,
  eigenkapitalquote,
  findVjConsistencyMismatches,
  jahresueberschussCents,
  liquideMittelCents,
  type BilanzPositionRow,
} from "./bilanz-kpis";

function P(
  stmt: "aktiva" | "passiva" | "guv",
  code: string,
  level: number,
  label: string,
  gj: number,
  vj: number | null = null,
): BilanzPositionRow {
  return {
    statement: stmt,
    code,
    parent_code: null,
    level,
    label,
    sort_order: 0,
    betrag_cents: gj,
    vorjahr_cents: vj,
  };
}

const FIXTURE: BilanzPositionRow[] = [
  P("aktiva", "A", 0, "Anlagevermögen", 40000000, 39000000),
  P("aktiva", "B", 0, "Umlaufvermögen", 42290094, 40000000),
  P("aktiva", "B.IV.1", 2, "Kassenbestand", 500000, 400000),
  P("aktiva", "B.IV.2", 2, "Guthaben bei Kreditinstituten", 21041891, 20000000),
  P("passiva", "A", 0, "Eigenkapital", 50000000, 48000000),
  P("passiva", "B", 0, "Rückstellungen", 32290094, 31000000),
  P("guv", "guv.14", 0, "Jahresüberschuss", 2000000, 1500000),
];

describe("bilanz-kpis — Anker-Treffer", () => {
  it("Bilanzsumme = Σ Top-Level Aktiva (GJ und VJ)", () => {
    expect(bilanzsummeCents(FIXTURE, "gj")).toBe(82290094);
    expect(bilanzsummeCents(FIXTURE, "vj")).toBe(79000000);
  });

  it("Eigenkapital = Passiva-Top-Level 'Eigenkapital'", () => {
    expect(eigenkapitalCents(FIXTURE, "gj")).toBe(50000000);
    expect(eigenkapitalCents(FIXTURE, "vj")).toBe(48000000);
  });

  it("Eigenkapitalquote = EK / Bilanzsumme", () => {
    const q = eigenkapitalquote(FIXTURE, "gj")!;
    expect(q).toBeCloseTo(50000000 / 82290094, 6);
  });

  it("Liquide Mittel = Σ Aktiva-Positionen mit Kassen-/Bank-Anker", () => {
    expect(liquideMittelCents(FIXTURE, "gj")).toBe(500000 + 21041891);
  });

  it("Jahresüberschuss = GuV-Top-Level 'Jahresüberschuss'", () => {
    expect(jahresueberschussCents(FIXTURE, "gj")).toBe(2000000);
  });

  it("deriveBilanzKpis liefert alle Werte mit missing=false", () => {
    const k = deriveBilanzKpis(FIXTURE, "gj");
    expect(k.bilanzsumme.missing).toBe(false);
    expect(k.eigenkapital.missing).toBe(false);
    expect(k.liquideMittel.missing).toBe(false);
    expect(k.jahresueberschuss.missing).toBe(false);
    expect(k.eigenkapitalquote.missing).toBe(false);
  });
});

describe("bilanz-kpis — Anker fehlt → null (keine Halluzination)", () => {
  const NO_EK = FIXTURE.filter((p) => !(p.statement === "passiva" && p.label === "Eigenkapital"));
  const NO_KASSE = FIXTURE.filter((p) => !/kassen|guthaben/i.test(p.label));
  const NO_JUEBER = FIXTURE.filter((p) => p.statement !== "guv");

  it("Eigenkapital null wenn Anker fehlt", () => {
    expect(eigenkapitalCents(NO_EK, "gj")).toBeNull();
    expect(eigenkapitalquote(NO_EK, "gj")).toBeNull();
  });

  it("Liquide Mittel null wenn Anker fehlt", () => {
    expect(liquideMittelCents(NO_KASSE, "gj")).toBeNull();
  });

  it("Jahresüberschuss null wenn Anker fehlt", () => {
    expect(jahresueberschussCents(NO_JUEBER, "gj")).toBeNull();
  });

  it("Bilanzsumme null bei fehlendem Aktiva", () => {
    expect(bilanzsummeCents([], "gj")).toBeNull();
  });
});

describe("findVjConsistencyMismatches", () => {
  const y2024: BilanzPositionRow[] = [
    P("aktiva", "A", 0, "Anlagevermögen", 500, 400), // VJ=400
    P("passiva", "A", 0, "Eigenkapital", 700, 600),
  ];
  const y2023_ok: BilanzPositionRow[] = [
    P("aktiva", "A", 0, "Anlagevermögen", 400, 350), // GJ=400 → passt
    P("passiva", "A", 0, "Eigenkapital", 600, 500),
  ];
  const y2023_abweichend: BilanzPositionRow[] = [
    P("aktiva", "A", 0, "Anlagevermögen", 380, 350), // GJ=380 ≠ 400
    P("passiva", "A", 0, "Eigenkapital", 600, 500),
  ];

  it("keine Mismatches bei konsistenten Berichten", () => {
    expect(findVjConsistencyMismatches(y2024, y2023_ok)).toEqual([]);
  });

  it("meldet Abweichung mit Diff", () => {
    const m = findVjConsistencyMismatches(y2024, y2023_abweichend);
    expect(m).toHaveLength(1);
    expect(m[0].code).toBe("A");
    expect(m[0].reportVjCents).toBe(400);
    expect(m[0].prevGjCents).toBe(380);
    expect(m[0].diffCents).toBe(20);
  });

  it("ignoriert Position, die im Vorjahr fehlt", () => {
    const y2023_ohne: BilanzPositionRow[] = [P("passiva", "A", 0, "Eigenkapital", 600, 500)];
    // Nur Anlagevermoegen in 2024 hat Vorjahr; 2023 hat es nicht → ignoriert.
    const m = findVjConsistencyMismatches(y2024, y2023_ohne);
    expect(m).toEqual([]);
  });

  it("ignoriert Position ohne VJ-Wert im spaeteren Bericht", () => {
    const y2024_ohneVj: BilanzPositionRow[] = [P("aktiva", "A", 0, "Anlagevermögen", 500, null)];
    expect(findVjConsistencyMismatches(y2024_ohneVj, y2023_abweichend)).toEqual([]);
  });
});
