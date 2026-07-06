import { describe, it, expect } from "vitest";
import { selectAllPaged } from "./select-all";

function mockQuery<T>(pages: T[][]) {
  // Baut eine buildQuery-Fabrik, die pro Seite den nächsten Pages-Eintrag
  // zurückliefert. Prüft nebenbei, dass jede Seite mit (from, to) im
  // erwarteten Muster abgefragt wird.
  let call = 0;
  const seenRanges: Array<[number, number]> = [];
  const build = (from: number, to: number) => ({
    range: async (rFrom: number, rTo: number) => {
      expect(rFrom).toBe(from);
      expect(rTo).toBe(to);
      seenRanges.push([rFrom, rTo]);
      const page = pages[call] ?? [];
      call += 1;
      return { data: page, error: null };
    },
  });
  return { build, seenRanges, calls: () => call };
}

describe("selectAllPaged", () => {
  it("leere erste Seite → leeres Ergebnis, genau ein Aufruf", async () => {
    const q = mockQuery<number>([[]]);
    const out = await selectAllPaged(q.build, 3);
    expect(out).toEqual([]);
    expect(q.calls()).toBe(1);
    expect(q.seenRanges).toEqual([[0, 2]]);
  });

  it("weniger als pageSize → sofort fertig", async () => {
    const q = mockQuery<number>([[1, 2]]);
    const out = await selectAllPaged(q.build, 3);
    expect(out).toEqual([1, 2]);
    expect(q.calls()).toBe(1);
  });

  it("genau pageSize → zweite Seite folgt, leer bricht ab", async () => {
    const q = mockQuery<number>([[1, 2, 3], []]);
    const out = await selectAllPaged(q.build, 3);
    expect(out).toEqual([1, 2, 3]);
    expect(q.calls()).toBe(2);
    expect(q.seenRanges).toEqual([
      [0, 2],
      [3, 5],
    ]);
  });

  it("mehrere volle Seiten + Rest → alle Zeilen in Reihenfolge", async () => {
    const q = mockQuery<number>([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8],
    ]);
    const out = await selectAllPaged(q.build, 3);
    expect(out).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(q.calls()).toBe(3);
    expect(q.seenRanges).toEqual([
      [0, 2],
      [3, 5],
      [6, 8],
    ]);
  });

  it("Fehler wirft", async () => {
    const build = () => ({
      range: async () => ({ data: null, error: { message: "boom" } }),
    });
    await expect(selectAllPaged(build, 10)).rejects.toThrow("boom");
  });

  it("pageSize <= 0 wirft", async () => {
    const build = () => ({ range: async () => ({ data: [], error: null }) });
    await expect(selectAllPaged(build, 0)).rejects.toThrow("pageSize");
  });
});
