import { describe, expect, it } from "vitest";
import { assertHeaders, parseCsv } from "./csv";
import { parseTagesabrechnungCsv } from "./parse-tagesabrechnung";

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

  it("erkennt Semikolon-Delimiter aus der Header-Zeile", () => {
    const { headers, rows } = parseCsv("a;b;c\n1;2;3\n");
    expect(headers).toEqual(["a", "b", "c"]);
    expect(rows).toEqual([{ a: "1", b: "2", c: "3" }]);
  });

  it("behält Komma in Quotes auch bei Semikolon-Delimiter", () => {
    const { rows } = parseCsv('a;b\n"x,y";"z"\n');
    expect(rows).toEqual([{ a: "x,y", b: "z" }]);
  });
});

describe("Supabase-Export (semikolon, alphabetisch sortierte Spalten)", () => {
  it("akzeptiert echten Tagesabrechnungs-Export", () => {
    const header =
      "absence_type;department;employee_id;end_time;evening_hours;id;is_holiday;night_deep_hours;night_hours;shift_date;staff_name;staff_nickname;start_time;sunday_holiday_hours;total_hours";
    // Eine reguläre Schicht (HH:MM:SS), eine mit HH:MM, eine Abwesenheit, eine mit Übernacht.
    const lines = [
      header,
      ";Service;emp-1;23:00:00;3;shift-1;false;0;0;2026-01-15;ANNA;ANNA;17:00:00;0;6",
      ";Bar;emp-2;23:00;3;shift-2;false;0;0;2026-01-15;BOB;BOB;17:00;0;6",
      "vacation;Service;emp-1;;0;shift-3;false;0;0;2026-01-16;ANNA;ANNA;;0;0",
      ";Bar;emp-2;02:00:00;4;shift-4;false;2.00;2;2026-01-17;BOB;BOB;21:00:00;0;5",
    ].join("\n");
    const rows = parseTagesabrechnungCsv(lines);
    expect(rows).toHaveLength(4);
    expect(rows[0].skipReason).toBeNull();
    expect(rows[0].startedAt).toBe("2026-01-15T16:00:00.000Z");
    expect(rows[1].skipReason).toBeNull();
    expect(rows[1].startedAt).toBe("2026-01-15T16:00:00.000Z");
    expect(rows[1].endedAt).toBe("2026-01-15T22:00:00.000Z");
    expect(rows[2].skipReason).toBe("absence");
    expect(rows[3].endedAt).toBe("2026-01-18T01:00:00.000Z");
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
    expect(() => assertHeaders(["a", "b", "extra"], ["a", "b"], "test")).toThrow(
      /überzählig: extra/,
    );
  });
});
