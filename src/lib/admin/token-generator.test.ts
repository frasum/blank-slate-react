import { describe, it, expect } from "vitest";
import { generateBadgeToken } from "./token-generator";

describe("generateBadgeToken", () => {
  it("liefert 43 Zeichen base64url (32 Byte ohne Padding)", () => {
    const t = generateBadgeToken();
    expect(t).toHaveLength(43);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("enthält keine padding- oder URL-unsicheren Zeichen", () => {
    const t = generateBadgeToken();
    expect(t).not.toMatch(/[+/=]/);
  });

  it("ist über 10000 Aufrufe eindeutig", () => {
    const set = new Set<string>();
    for (let i = 0; i < 10000; i++) set.add(generateBadgeToken());
    expect(set.size).toBe(10000);
  });

  it("benutzt den injizierten Zufallsgenerator", () => {
    const fixed = new Uint8Array(32).fill(0);
    const t = generateBadgeToken(() => fixed);
    expect(t).toBe("A".repeat(43).slice(0, 43)); // 'AAAA...' base64url for 32 zero bytes
  });
});
