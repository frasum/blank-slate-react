import { describe, expect, it } from "vitest";
import { assertHeaders, parseCsv } from "./csv";

describe("parseCsv", () => {
  it("liest einfache Zeilen", () => {
    const { headers, rows } = parseCsv("a,b,c\n1,2,3\n4,5,6\n");
    expect(headers).toEqual(["a", "b", "c"]);
    expect(rows).toEqual([
      { a: "1", b: "2", c: "3" },
      { a: "4", b: "5", c: "6" },
    ]);
  });

  it("interpretiert leeres Feld als null", () => {
    const { rows } = parseCsv("a,b\n1,\n,2\n");
    expect(rows).toEqual([
      { a: "1", b: null },
      { a: null, b: "2" },
    ]);
  });

  it("verarbeitet Quoting mit Komma und Doppelquote", () => {
    const { rows } = parseCsv('a,b\n"x, y","he said ""hi"""\n');
    expect(rows).toEqual([{ a: "x, y", b: 'he said "hi"' }]);
  });

  it("entfernt BOM und akzeptiert CRLF", () => {
    const { headers, rows } = parseCsv("\uFEFFa,b\r\n1,2\r\n");
    expect(headers).toEqual(["a", "b"]);
    expect(rows).toEqual([{ a: "1", b: "2" }]);
  });
});

describe("assertHeaders", () => {
  it("akzeptiert exakte Übereinstimmung in beliebiger Reihenfolge", () => {
    expect(() => assertHeaders(["b", "a"], ["a", "b"], "test")).not.toThrow();
  });

  it("wirft mit präziser Liste fehlender Spalten", () => {
    expect(() => assertHeaders(["a"], ["a", "b", "c"], "test")).toThrow(/fehlend: b, c/);
  });

  it("wirft mit präziser Liste überzähliger Spalten", () => {
    expect(() => assertHeaders(["a", "b", "extra"], ["a", "b"], "test")).toThrow(/überzählig: extra/);
  });
});