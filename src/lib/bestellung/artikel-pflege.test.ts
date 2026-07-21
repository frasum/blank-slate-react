import { describe, it, expect } from "vitest";
import {
  countReviewed,
  groupArticlesBySupplier,
  type ArtikelPflegeArticle,
  type ArtikelPflegeSupplier,
} from "./artikel-pflege";

const suppliers: ArtikelPflegeSupplier[] = [
  { id: "s-b", name: "Bäcker", is_active: true },
  { id: "s-a", name: "Adler-Wein", is_active: true },
  { id: "s-inactive", name: "Zzz Alt", is_active: false },
];

const articles: ArtikelPflegeArticle[] = [
  { id: "a1", supplier_id: "s-a", name: "Riesling", is_active: true, reviewed_at: null },
  {
    id: "a2",
    supplier_id: "s-a",
    name: "Chardonnay",
    is_active: true,
    reviewed_at: "2026-07-21T10:00:00Z",
  },
  { id: "a3", supplier_id: "s-a", name: "Alt-Chianti", is_active: false, reviewed_at: null },
  { id: "a4", supplier_id: "s-b", name: "Brötchen", is_active: true, reviewed_at: null },
];

describe("countReviewed", () => {
  it("zählt nur Artikel mit reviewed_at", () => {
    expect(countReviewed(articles)).toBe(1);
  });
  it("leere Liste = 0", () => {
    expect(countReviewed([])).toBe(0);
  });
});

describe("groupArticlesBySupplier", () => {
  it("Lieferanten alphabetisch, inaktive Lieferanten raus", () => {
    const groups = groupArticlesBySupplier(articles, suppliers, { showInactive: false });
    expect(groups.map((g) => g.supplierName)).toEqual(["Adler-Wein", "Bäcker"]);
  });

  it("Artikel innerhalb alphabetisch, inaktive Artikel per Default raus", () => {
    const groups = groupArticlesBySupplier(articles, suppliers, { showInactive: false });
    const adler = groups.find((g) => g.supplierId === "s-a")!;
    expect(adler.articles.map((a) => a.name)).toEqual(["Chardonnay", "Riesling"]);
    expect(adler.reviewedCount).toBe(1);
  });

  it("showInactive=true nimmt inaktive Artikel und ihren geprüft-Zähler mit", () => {
    const groups = groupArticlesBySupplier(articles, suppliers, { showInactive: true });
    const adler = groups.find((g) => g.supplierId === "s-a")!;
    expect(adler.articles.map((a) => a.name)).toEqual(["Alt-Chianti", "Chardonnay", "Riesling"]);
    expect(adler.reviewedCount).toBe(1);
  });

  it("Lieferant ohne Artikel wird als leere Gruppe mit 0/0 geliefert", () => {
    const groups = groupArticlesBySupplier([], suppliers, { showInactive: false });
    expect(groups).toHaveLength(2);
    for (const g of groups) {
      expect(g.articles).toEqual([]);
      expect(g.reviewedCount).toBe(0);
    }
  });
});
