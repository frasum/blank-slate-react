import { describe, expect, it } from "vitest";
import {
  countRuleHits,
  resolveCategory,
  sortRules,
  type CategoryRuleLite,
} from "./bank-categorize";

const rules: CategoryRuleLite[] = [
  { id: "r1", categoryId: "c-karte", matchField: "name", pattern: "First Data", priority: 100 },
  { id: "r2", categoryId: "c-bar", matchField: "zweck", pattern: "Einzahlung", priority: 100 },
  { id: "r3", categoryId: "c-lohn", matchField: "zweck", pattern: "Anzahl Umsätze", priority: 50 },
];

describe("resolveCategory", () => {
  const sorted = sortRules(rules);

  it("Override schlägt jede Regel", () => {
    const res = resolveCategory(
      { gegenpartei: "First Data GmbH", verwendungszweck: "", overrideCategoryId: "c-eigenes" },
      sorted,
    );
    expect(res).toEqual({ categoryId: "c-eigenes", source: "override", ruleId: null });
  });

  it("matcht case-insensitiv als Substring", () => {
    const res = resolveCategory(
      { gegenpartei: "FIRST DATA GERMANY GMBH", verwendungszweck: "", overrideCategoryId: null },
      sorted,
    );
    expect(res.source).toBe("rule");
    expect(res.categoryId).toBe("c-karte");
  });

  it("Zweck-Regel greift", () => {
    const res = resolveCategory(
      { gegenpartei: "Frank", verwendungszweck: "Anzahl Umsätze: 20", overrideCategoryId: null },
      sorted,
    );
    expect(res.categoryId).toBe("c-lohn");
  });

  it("kein Treffer → source none", () => {
    const res = resolveCategory(
      { gegenpartei: "Unbekannt", verwendungszweck: "xyz", overrideCategoryId: null },
      sorted,
    );
    expect(res).toEqual({ categoryId: null, source: "none", ruleId: null });
  });

  it("niedrigere Priorität gewinnt bei Kollision", () => {
    const s = sortRules([
      { id: "a", categoryId: "cA", matchField: "name", pattern: "Bank", priority: 100 },
      { id: "b", categoryId: "cB", matchField: "name", pattern: "Bank", priority: 10 },
    ]);
    const res = resolveCategory(
      { gegenpartei: "Deutsche Bank", verwendungszweck: "", overrideCategoryId: null },
      s,
    );
    expect(res.categoryId).toBe("cB");
  });
});

describe("countRuleHits", () => {
  it("zählt nur echte Treffer, keine Overrides", () => {
    const txs = [
      { gegenpartei: "First Data", verwendungszweck: "", overrideCategoryId: null },
      { gegenpartei: "First Data", verwendungszweck: "", overrideCategoryId: "c-x" },
      { gegenpartei: "Frank", verwendungszweck: "Einzahlung 100", overrideCategoryId: null },
      { gegenpartei: "?", verwendungszweck: "?", overrideCategoryId: null },
    ];
    const counts = countRuleHits(txs, rules);
    expect(counts.r1).toBe(1);
    expect(counts.r2).toBe(1);
    expect(counts.r3).toBe(0);
  });
});
