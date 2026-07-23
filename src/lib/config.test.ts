import { describe, expect, it } from "vitest";
import { APP_URL, authRedirectUrl } from "./config";

describe("APP_URL / authRedirectUrl", () => {
  it("hat einen festen Produktions-Default (kein localhost)", () => {
    expect(APP_URL).toBe("https://cocoplatform.online");
    expect(APP_URL).not.toMatch(/localhost/i);
  });

  it("baut Redirect-URLs mit APP_URL-Präfix für alle Auth-Flüsse", () => {
    for (const path of ["/reset-password", "reset-password"]) {
      const url = authRedirectUrl(path);
      expect(url).toBe("https://cocoplatform.online/reset-password");
      expect(url.startsWith(APP_URL + "/")).toBe(true);
      expect(url).not.toMatch(/localhost/i);
      expect(url).not.toMatch(/127\.0\.0\.1/);
    }
  });

  it("erzeugt niemals doppelte Slashes zwischen Basis und Pfad", () => {
    expect(authRedirectUrl("/reset-password")).not.toMatch(/\/{2,}reset-password/);
  });
});