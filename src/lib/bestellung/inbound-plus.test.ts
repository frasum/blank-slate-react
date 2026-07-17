import { describe, it, expect } from "vitest";
import {
  buildReplyToForOrder,
  extractOrderNumberFromRecipients,
  INBOUND_DOMAIN,
} from "./inbound-plus";

describe("inbound-plus", () => {
  it("erkennt Bestellnummer aus Plus-Adresse (String, Kleinschreibung)", () => {
    expect(
      extractOrderNumberFromRecipients("antwort+ord-2026-07-1234@inbound.cocoplatform.online"),
    ).toBe("ORD-2026-07-1234");
  });
  it("ist präfix-agnostisch — EO-Nummern via Plus-Adresse werden erkannt", () => {
    expect(
      extractOrderNumberFromRecipients("antwort+EO-2026-05-0197@inbound.cocoplatform.online"),
    ).toBe("EO-2026-05-0197");
  });
  it("erkennt Bestellnummer aus Objekt-Empfänger", () => {
    expect(
      extractOrderNumberFromRecipients({
        email: "Antwort+ORD-2026-07-0001@inbound.cocoplatform.online",
      }),
    ).toBe("ORD-2026-07-0001");
  });
  it("nimmt ersten Treffer aus Empfänger-Array", () => {
    expect(
      extractOrderNumberFromRecipients([
        { email: "buchhaltung@yum-thai.de" },
        { email: "antwort+ORD-2026-07-0042@inbound.cocoplatform.online" },
      ]),
    ).toBe("ORD-2026-07-0042");
  });
  it("null bei fehlendem Plus-Teil", () => {
    expect(extractOrderNumberFromRecipients("antwort@inbound.cocoplatform.online")).toBeNull();
  });
  it("null bei Fremdformat (Local-Part nicht 'antwort')", () => {
    expect(
      extractOrderNumberFromRecipients("info+newsletter@inbound.cocoplatform.online"),
    ).toBeNull();
  });
  it("null bei leerem/undefiniertem Input", () => {
    expect(extractOrderNumberFromRecipients(undefined)).toBeNull();
    expect(extractOrderNumberFromRecipients([])).toBeNull();
    expect(extractOrderNumberFromRecipients(null)).toBeNull();
  });
  it("baut Reply-To korrekt", () => {
    expect(buildReplyToForOrder("ORD-2026-07-1234")).toBe(
      `antwort+ORD-2026-07-1234@${INBOUND_DOMAIN}`,
    );
  });
});
