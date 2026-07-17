// SL1 — DB-Integrationstest: pro Standort landet die richtige Kundennummer
// und Lieferadresse im gesendeten Bestellmail-Body.
//
// Deckt ab (zwei Standorte "Spice Ry" und "Yum" gegen denselben Lieferanten):
//   (a) Spice-Ry-Bestellung → HTML/Text enthalten K-SPI-42 + Spice-Ry-Adresse,
//       KEINE Yum-Werte.
//   (b) Yum-Bestellung        → HTML/Text enthalten K-YUM-77 + Yum-Adresse,
//       KEINE Spice-Ry-Werte.
//
// Bewusst KEIN Aufruf des Cart→Order-RPC: der Test setzt orders.delivery_address
// direkt (der RPC füllt sie ohnehin aus dem Standort — wir prüfen hier nur den
// Renderer/Versand-Pfad).

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { dbTestsEnabled, seedOrg, type SeededOrg } from "@/test/db-setup";
import { sendOrderEmailWithAdmin } from "./send-order-email.server";

type CapturedRequest = { html: string; text: string; subject: string; to: string };
const captured: CapturedRequest[] = [];

const SPICE_NUMBER = "K-SPI-42";
const YUM_NUMBER = "K-YUM-77";
const SPICE_ADDRESS = "Spice Ry\nSpicerystr. 1\n10115 Berlin";
const YUM_ADDRESS = "Yum\nYumallee 9\n10999 Berlin";

describe.skipIf(!dbTestsEnabled)("send-order-email · SL1 pro Standort", () => {
  let org: SeededOrg;
  let supplierId: string;
  let spiceLocationId: string;
  let yumLocationId: string;

  const origEnv = {
    key: process.env.MAILERSEND_API_KEY,
    from: process.env.MAILERSEND_FROM_EMAIL,
  };
  const origFetch = globalThis.fetch;

  beforeAll(async () => {
    process.env.MAILERSEND_API_KEY = "test-key";
    process.env.MAILERSEND_FROM_EMAIL = "bestellung@example.com";

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (!url.includes("api.mailersend.com")) {
        return origFetch(input as Parameters<typeof fetch>[0], init);
      }
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        html: string;
        text: string;
        subject: string;
        to: Array<{ email: string }>;
      };
      captured.push({
        html: body.html,
        text: body.text,
        subject: body.subject,
        to: body.to[0]?.email ?? "",
      });
      return new Response(JSON.stringify({ message_id: `msg-${captured.length}` }), {
        status: 202,
        headers: { "x-message-id": `msg-${captured.length}` },
      });
    }) as typeof fetch;

    org = await seedOrg("send-order-email-sl1");

    // Zwei Standorte: Spice Ry und Yum. Default-Standort aus seedOrg bleibt
    // ungenutzt und stört den Test nicht.
    spiceLocationId = await org.mkLocation("Spice Ry");
    yumLocationId = await org.mkLocation("Yum");

    // Ein Lieferant, org-weit mit anderer (falscher!) Kundennummer, damit
    // erkennbar ist, dass die Standort-Nummer gewinnt und nicht der Fallback.
    const { data: sup, error: supErr } = await org.service
      .from("suppliers")
      .insert({
        organization_id: org.orgId,
        name: "Frischdienst GmbH",
        email: "lieferant@example.com",
        customer_number: "K-ORG-FALLBACK",
      })
      .select("id")
      .single();
    if (supErr || !sup) throw new Error(`supplier seed failed: ${supErr?.message}`);
    supplierId = sup.id as string;

    // Standort-eigene Kundennummern.
    const { error: slErr } = await org.service.from("supplier_locations").insert([
      {
        organization_id: org.orgId,
        supplier_id: supplierId,
        location_id: spiceLocationId,
        customer_number: SPICE_NUMBER,
        is_active: true,
      },
      {
        organization_id: org.orgId,
        supplier_id: supplierId,
        location_id: yumLocationId,
        customer_number: YUM_NUMBER,
        is_active: true,
      },
    ]);
    if (slErr) throw new Error(`supplier_locations seed failed: ${slErr.message}`);
  });

  afterAll(async () => {
    globalThis.fetch = origFetch;
    if (origEnv.key === undefined) delete process.env.MAILERSEND_API_KEY;
    else process.env.MAILERSEND_API_KEY = origEnv.key;
    if (origEnv.from === undefined) delete process.env.MAILERSEND_FROM_EMAIL;
    else process.env.MAILERSEND_FROM_EMAIL = origEnv.from;
    // supplier_locations hängen an suppliers → mit dem Lieferanten weg.
    await org?.service.from("supplier_locations").delete().eq("organization_id", org.orgId);
    await org?.service.from("orders").delete().eq("organization_id", org.orgId);
    await org?.service.from("suppliers").delete().eq("organization_id", org.orgId);
    await org?.cleanup();
  });

  async function mkOrder(
    orderNumber: string,
    locationId: string,
    address: string,
  ): Promise<string> {
    const { data, error } = await org.service
      .from("orders")
      .insert({
        organization_id: org.orgId,
        supplier_id: supplierId,
        location_id: locationId,
        order_number: orderNumber,
        status: "pending",
        total_amount_cents: 0,
        delivery_address: address,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`order seed failed: ${error?.message}`);
    return data.id as string;
  }

  it("(a) Spice-Ry-Bestellung: Kundennummer + Adresse aus Spice Ry, nichts von Yum", async () => {
    const orderId = await mkOrder("ORD-SL1-SPI-1", spiceLocationId, SPICE_ADDRESS);
    captured.length = 0;
    await sendOrderEmailWithAdmin(org.service, org.orgId, orderId);
    expect(captured).toHaveLength(1);
    const c = captured[0];

    // Kundennummer: Standort gewinnt, org-weiter Fallback darf NICHT auftauchen.
    expect(c.subject).toContain(SPICE_NUMBER);
    expect(c.html).toContain(SPICE_NUMBER);
    expect(c.text).toContain(SPICE_NUMBER);
    expect(c.html).not.toContain(YUM_NUMBER);
    expect(c.html).not.toContain("K-ORG-FALLBACK");

    // Lieferadresse (HTML rendert \n als <br />).
    expect(c.html).toContain("Spicerystr. 1");
    expect(c.html).toContain("10115 Berlin");
    expect(c.text).toContain("Spicerystr. 1");
    expect(c.html).not.toContain("Yumallee");
    expect(c.text).not.toContain("Yumallee");

    // Restaurant-Name im Betreff = Standortname.
    expect(c.subject).toContain("Spice Ry");
    expect(c.subject).not.toContain("Yum");
  });

  it("(b) Yum-Bestellung: Kundennummer + Adresse aus Yum, nichts von Spice Ry", async () => {
    const orderId = await mkOrder("ORD-SL1-YUM-1", yumLocationId, YUM_ADDRESS);
    captured.length = 0;
    await sendOrderEmailWithAdmin(org.service, org.orgId, orderId);
    expect(captured).toHaveLength(1);
    const c = captured[0];

    expect(c.subject).toContain(YUM_NUMBER);
    expect(c.html).toContain(YUM_NUMBER);
    expect(c.text).toContain(YUM_NUMBER);
    expect(c.html).not.toContain(SPICE_NUMBER);
    expect(c.html).not.toContain("K-ORG-FALLBACK");

    expect(c.html).toContain("Yumallee 9");
    expect(c.html).toContain("10999 Berlin");
    expect(c.text).toContain("Yumallee 9");
    expect(c.html).not.toContain("Spicerystr");
    expect(c.text).not.toContain("Spicerystr");

    expect(c.subject).toContain("Yum");
    expect(c.subject).not.toContain("Spice Ry");
  });
});
