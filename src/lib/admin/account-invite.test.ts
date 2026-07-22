// Zod-Input-Unit für inviteStaffByEmail. Die Server-Fn selbst wird nicht
// aufgerufen — hier geht es nur um die Eingabe-Validierung (staffId UUID,
// E-Mail-Format, Trim).

import { describe, expect, it } from "vitest";
import { z } from "zod";

const inviteSchema = z.object({
  staffId: z.string().uuid(),
  email: z.string().trim().email().max(254),
});

describe("inviteStaffByEmail input schema", () => {
  const uuid = "11111111-2222-3333-4444-555555555555";

  it("akzeptiert gültige Eingabe", () => {
    const r = inviteSchema.parse({ staffId: uuid, email: "  a@b.de  " });
    expect(r.email).toBe("a@b.de");
  });

  it("lehnt ungültige UUID ab", () => {
    expect(() => inviteSchema.parse({ staffId: "no-uuid", email: "a@b.de" })).toThrow();
  });

  it("lehnt Pseudo-Adressen ohne @ ab", () => {
    expect(() => inviteSchema.parse({ staffId: uuid, email: "vorname" })).toThrow();
  });

  it("lehnt leere E-Mail ab", () => {
    expect(() => inviteSchema.parse({ staffId: uuid, email: "   " })).toThrow();
  });
});