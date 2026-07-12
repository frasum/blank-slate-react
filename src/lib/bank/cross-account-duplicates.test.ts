import { describe, expect, it } from "vitest";
import {
  findCrossAccountMatches,
  fingerprint,
  normalizeGegenpartei,
  summarizeCrossAccountHits,
} from "./cross-account-duplicates";

describe("normalizeGegenpartei", () => {
  it("case- und whitespace-insensitiv, entfernt diakritische Zeichen", () => {
    expect(normalizeGegenpartei("  KAO GmbH  ")).toBe("kao gmbh");
    expect(normalizeGegenpartei("Café  Müller")).toBe("cafe muller");
  });
});

describe("fingerprint", () => {
  it("bindet buchungstag + betragCents + normalisierte Gegenpartei — ohne Zweck", () => {
    expect(
      fingerprint({ buchungstag: "2026-06-29", betragCents: -12345, gegenpartei: "KAO GmbH" }),
    ).toBe("2026-06-29|-12345|kao gmbh");
  });
});

describe("findCrossAccountMatches", () => {
  const spiceryTxs = [
    {
      accountId: "sp-1",
      accountName: "Spicery",
      iban: "DE01",
      buchungstag: "2026-06-29",
      betragCents: -12345,
      gegenpartei: "KAO GmbH",
    },
    {
      accountId: "sp-1",
      accountName: "Spicery",
      iban: "DE01",
      buchungstag: "2026-06-30",
      betragCents: -500,
      gegenpartei: "Focus AG",
    },
  ];

  it("erkennt 2 von 3 Kandidatenzeilen als bereits in anderem Konto vorhanden", () => {
    const candidates = [
      { buchungstag: "2026-06-29", betragCents: -12345, gegenpartei: "KAO GmbH" }, // Hit
      { buchungstag: "2026-06-30", betragCents: -500, gegenpartei: "focus ag" }, // Hit (case-insensitiv)
      { buchungstag: "2026-06-30", betragCents: 9999, gegenpartei: "Unbekannt" }, // kein Hit
    ];
    const hits = findCrossAccountMatches(candidates, spiceryTxs);
    expect(hits).toHaveLength(2);
    const summary = summarizeCrossAccountHits(hits);
    expect(summary).toEqual([
      { accountId: "sp-1", accountName: "Spicery", iban: "DE01", count: 2 },
    ]);
  });

  it("keine Treffer wenn Beträge abweichen", () => {
    const hits = findCrossAccountMatches(
      [{ buchungstag: "2026-06-29", betragCents: -12346, gegenpartei: "KAO GmbH" }],
      spiceryTxs,
    );
    expect(hits).toHaveLength(0);
  });
});
