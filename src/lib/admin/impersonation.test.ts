import { describe, it, expect } from "vitest";
import { assertRealIdentity, PREVIEW_READ_ONLY_MESSAGE } from "./impersonation";

describe("assertRealIdentity", () => {
  it("erlaubt echte Identität (impersonatedBy=null)", () => {
    expect(() => assertRealIdentity({ impersonatedBy: null })).not.toThrow();
  });

  it("verweigert Vorschau mit klarer Meldung", () => {
    expect(() => assertRealIdentity({ impersonatedBy: "admin-staff-id" })).toThrow(
      PREVIEW_READ_ONLY_MESSAGE,
    );
  });
});