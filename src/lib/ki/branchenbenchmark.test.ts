import { describe, expect, it } from "vitest";
import {
  BENCHMARKS,
  BENCHMARK_QUELLE,
  BENCHMARK_STAND,
  listBenchmarks,
  lookupBenchmark,
} from "./branchenbenchmark";

describe("branchenbenchmark", () => {
  it("liefert alle vier Kennzahlen für Vollgastronomie DE", () => {
    const kennzahlen = listBenchmarks().map((b) => b.kennzahl);
    expect(kennzahlen).toEqual([
      "umsatz_pro_arbeitsstunde",
      "personalkostenquote",
      "wareneinsatzquote",
      "bon_pro_gast",
    ]);
  });

  it("jede Kennzahl hat plausible Bandbreite (von < bis, beide > 0)", () => {
    for (const b of BENCHMARKS) {
      expect(b.von).toBeGreaterThan(0);
      expect(b.bis).toBeGreaterThan(b.von);
      expect(b.segment).toBe("vollgastronomie_de");
      expect(b.hinweis.length).toBeGreaterThan(10);
    }
  });

  it("lookup liefert Eintrag oder undefined", () => {
    expect(lookupBenchmark("personalkostenquote")?.von).toBe(32);
    // @ts-expect-error — bewusst ungültiger Wert
    expect(lookupBenchmark("gibts_nicht")).toBeUndefined();
  });

  it("Quelle und Stand sind gesetzt", () => {
    expect(BENCHMARK_QUELLE).toMatch(/DEHOGA/);
    expect(BENCHMARK_STAND).toMatch(/^\d{4}$/);
  });
});