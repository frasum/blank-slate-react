import { describe, expect, it } from "vitest";
import { chunk, extractSingleIban } from "./bank-import-helpers";

describe("extractSingleIban", () => {
  it("liefert die IBAN, wenn alle Zeilen die gleiche haben", () => {
    const res = extractSingleIban([
      { iban: "DE26700700240052787901" },
      { iban: "DE26700700240052787901" },
    ]);
    expect(res).toEqual({ ok: true, iban: "DE26700700240052787901" });
  });
  it("ignoriert Whitespace in der IBAN", () => {
    const res = extractSingleIban([{ iban: "DE26 7007 0024 0052 7879 01" }]);
    expect(res).toEqual({ ok: true, iban: "DE26700700240052787901" });
  });
  it("meldet mehrere IBANs als Fehler", () => {
    const res = extractSingleIban([
      { iban: "DE26700700240052787901" },
      { iban: "DE53700700240052787900" },
    ]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.ibans.sort()).toEqual([
      "DE26700700240052787901",
      "DE53700700240052787900",
    ]);
  });
  it("leere Eingabe: keine IBAN", () => {
    const res = extractSingleIban([]);
    expect(res).toEqual({ ok: false, ibans: [] });
  });
});

describe("chunk", () => {
  it("teilt ein Array in gleich große Blöcke, letzter Block kürzer", () => {
    const arr = Array.from({ length: 1200 }, (_, i) => i);
    const parts = chunk(arr, 500);
    expect(parts.length).toBe(3);
    expect(parts[0].length).toBe(500);
    expect(parts[1].length).toBe(500);
    expect(parts[2].length).toBe(200);
    expect(parts.flat()).toEqual(arr);
  });
  it("leeres Array → leeres Ergebnis", () => {
    expect(chunk([], 500)).toEqual([]);
  });
  it("size <= 0 wirft", () => {
    expect(() => chunk([1, 2], 0)).toThrow();
  });
});