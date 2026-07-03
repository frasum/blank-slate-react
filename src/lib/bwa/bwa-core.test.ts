import { describe, expect, it } from "vitest";
import { BWA_TOLERANCE_CENTS, deriveBwa, validateBwaMonth, type BwaMonthInput } from "./bwa-core";

// YUM April 2024 (Referenzblatt Steuerberater).
const YUM_APR_2024: BwaMonthInput = {
  umsatzCents: 11_352_700,
  getraenkeCents: 2_917_600,
  speisenHausCents: 8_343_000,
  speisenAusserHausCents: 0,
  sonstigeErloeseCents: 92_100,
  sonstErtraegeCents: 109_300,
  wareneinsatzCents: 2_089_700,
  personalCents: 7_625_300,
  sachkostenCents: 1_239_000,
  anlageCents: 501_600,
  abschreibungCents: 215_000,
  betriebsergebnisCents: -208_600,
};

describe("deriveBwa", () => {
  it("YUM Apr 24: berechnet Gesamtleistung, Rohertrag I/II, Ergebnis op., Betriebsergebnis-Soll", () => {
    const d = deriveBwa(YUM_APR_2024);
    expect(d.gesamtleistungCents).toBe(11_462_000);
    expect(d.rohertrag1Cents).toBe(9_372_300);
    expect(d.rohertrag2Cents).toBe(1_747_000);
    expect(d.ergebnisOpCents).toBe(508_000);
    expect(d.betriebsergebnisSollCents).toBe(-208_600);
  });
});

describe("validateBwaMonth", () => {
  it("YUM Apr 24: grün (Quersummen stimmen exakt)", () => {
    expect(validateBwaMonth(YUM_APR_2024)).toEqual({ ok: true });
  });

  it("Betriebsergebnis passt nicht → Fehler nennt beide Beträge", () => {
    const r = validateBwaMonth({ ...YUM_APR_2024, betriebsergebnisCents: -100_000 });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.errors.length).toBe(1);
    expect(r.errors[0]).toMatch(/Betriebsergebnis/);
    expect(r.errors[0]).toMatch(/1\.000,00/); // eingegeben (−1.000 €)
    expect(r.errors[0]).toMatch(/2\.086,00/); // berechnet (−2.086 €)
  });

  it("Umsatz-Quersumme passt nicht → separater Fehler", () => {
    const r = validateBwaMonth({ ...YUM_APR_2024, getraenkeCents: 1_000_000 });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.errors.some((e) => /Umsatz/.test(e))).toBe(true);
  });

  it("Toleranz-Rand: ±300 Cent ok, ±301 Cent nicht", () => {
    const at = validateBwaMonth({
      ...YUM_APR_2024,
      betriebsergebnisCents: -208_600 + BWA_TOLERANCE_CENTS,
    });
    expect(at.ok).toBe(true);
    const over = validateBwaMonth({
      ...YUM_APR_2024,
      betriebsergebnisCents: -208_600 + BWA_TOLERANCE_CENTS + 1,
    });
    expect(over.ok).toBe(false);
  });
});
