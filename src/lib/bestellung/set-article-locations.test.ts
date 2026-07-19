import { describe, it, expect } from "vitest";
import { SetArticleLocationsInput } from "./articles.functions";

describe("SetArticleLocationsInput", () => {
  const articleId = "11111111-1111-1111-1111-111111111111";
  const locationId = "22222222-2222-2222-2222-222222222222";

  it("akzeptiert genau einen Standort", () => {
    const parsed = SetArticleLocationsInput.parse({
      articleId,
      locationIds: [locationId],
    });
    expect(parsed.locationIds).toEqual([locationId]);
  });

  it("lehnt leere locationIds ab (Mindest-Regel serverseitig)", () => {
    expect(() =>
      SetArticleLocationsInput.parse({ articleId, locationIds: [] }),
    ).toThrow(/Mindestens ein Standort/);
  });

  it("lehnt Nicht-UUIDs ab", () => {
    expect(() =>
      SetArticleLocationsInput.parse({ articleId, locationIds: ["not-a-uuid"] }),
    ).toThrow();
  });
});