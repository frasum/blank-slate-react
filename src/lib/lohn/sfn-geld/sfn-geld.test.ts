/**
 * Golden-Master-Test M4 Stufe 2a — SFN-Geld.
 *
 * Lädt golden-master/sfn-geld-faelle.json und prüft je Fall in beiden Modi
 * BITGENAU alle 5 Topf-Felder + zuschlagCents (toBe, Toleranz 0).
 * Erwartungswerte stammen aus der Ausführung des Originals
 * (tagesabrechnung) — nicht anpassen.
 */
import { describe, expect, it } from "vitest";
import fixtures from "./golden-master/sfn-geld-faelle.json";
import { berechneSfnGeld } from "./sfn-geld";
import type { SfnBuckets, SfnMode, SfnShiftRow } from "./types";

type ExpectedBuckets = SfnBuckets & { zuschlagCents: number };
type Fall = {
  name: string;
  hourlyRateCents: number;
  shifts: SfnShiftRow[];
  simple: ExpectedBuckets;
  extended: ExpectedBuckets;
};
type Fixture = {
  _holidayRates: Record<string, number>;
  faelle: Fall[];
};

const fx = fixtures as Fixture;
const holidayRates = new Map<string, number>(Object.entries(fx._holidayRates));

describe("Golden Master: SFN-Geld (M4 Stufe 2a)", () => {
  it("Fixture enthält 5 Fälle", () => {
    expect(fx.faelle.length).toBe(5);
  });

  for (const fall of fx.faelle) {
    for (const mode of ["simple", "extended"] as SfnMode[]) {
      it(`reproduziert bitgenau [${mode}]: ${fall.name}`, () => {
        const got = berechneSfnGeld(fall.shifts, mode, fall.hourlyRateCents, holidayRates);
        const exp = fall[mode];
        expect(got.night25Hours).toBe(exp.night25Hours);
        expect(got.night40Hours).toBe(exp.night40Hours);
        expect(got.sundayHours).toBe(exp.sundayHours);
        expect(got.holidayHours).toBe(exp.holidayHours);
        expect(got.holiday150Hours).toBe(exp.holiday150Hours);
        expect(got.zuschlagCents).toBe(exp.zuschlagCents);
      });
    }
  }
});
