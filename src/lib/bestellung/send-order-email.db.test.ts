// BM-A — DB-Integrationstest: Erstkontakt-Hinweis in der ersten Echt-Bestellmail.
//
// Deckt ab:
//   (a) erster Echt-Versand → Hinweisblock in HTML + Text, first_live_order_email_at gesetzt
//   (b) zweiter Echt-Versand → kein Block, Timestamp unverändert
//   (c) Testmodus-Versand vor Erstkontakt → kein Block, Timestamp bleibt NULL

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { dbTestsEnabled, seedOrg, type SeededOrg } from "@/test/db-setup";
import { sendOrderEmailWithAdmin } from "./send-order-email.server";
import { FIRST_CONTACT_NOTICE_TEMPLATE } from "./order-email";

type CapturedRequest = { html: string; text: string; to: string };
const captured: CapturedRequest[] = [];

const FROM_EMAIL = "bestellung@example.com";
const NOTICE_SNIPPET = FIRST_CONTACT_NOTICE_TEMPLATE.replace("{FROM_EMAIL}", FROM_EMAIL).slice(
  0,
  60,
);

describe.skipIf(!dbTestsEnabled)("send-order-email · BM-A Erstkontakt", () => {
  let org: SeededOrg;
  let supplierId: string;

  const origEnv = {
    key: process.env.MAILERSEND_API_KEY,
    from: process.env.MAILERSEND_FROM_EMAIL,
  };
  const origFetch = globalThis.fetch;

  beforeAll(async () => {
    process.env.MAILERSEND_API_KEY = "test-key";
    process.env.MAILERSEND_FROM_EMAIL = FROM_EMAIL;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (!url.includes("api.mailersend.com")) {
        return origFetch(input as Parameters<typeof fetch>[0], init);
      }
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        html: string;
        text: string;
        to: Array<{ email: string }>;
      };
      captured.push({ html: body.html, text: body.text, to: body.to[0]?.email ?? "" });
      return new Response(JSON.stringify({ message_id: `msg-${captured.length}` }), {
        status: 202,
        headers: { "x-message-id": `msg-${captured.length}` },
      });
    }) as typeof fetch;

    org = await seedOrg("send-order-email-bma");
    const { data: sup } = await org.service
      .from("suppliers")
      .insert({
        organization_id: org.orgId,
        name: "Lieferant BM-A",
        email: "lieferant@example.com",
      })
      .select("id")
      .single();
    supplierId = sup!.id as string;
  });

  afterAll(async () => {
    globalThis.fetch = origFetch;
    if (origEnv.key === undefined) delete process.env.MAILERSEND_API_KEY;
    else process.env.MAILERSEND_API_KEY = origEnv.key;
    if (origEnv.from === undefined) delete process.env.MAILERSEND_FROM_EMAIL;
    else process.env.MAILERSEND_FROM_EMAIL = origEnv.from;
    await org?.cleanup();
  });

  async function mkOrder(num: string): Promise<string> {
    const { data } = await org.service
      .from("orders")
      .insert({
        organization_id: org.orgId,
        supplier_id: supplierId,
        location_id: org.defaultLocationId,
        order_number: num,
        status: "pending",
        total_amount_cents: 0,
      })
      .select("id")
      .single();
    return data!.id as string;
  }

  async function setTestMode(enabled: boolean): Promise<void> {
    await org.service
      .from("organization_settings")
      .update({ test_mode_enabled: enabled, test_mode_email: "test@example.com" })
      .eq("organization_id", org.orgId);
  }

  async function readFirstLive(): Promise<string | null> {
    const { data } = await org.service
      .from("suppliers")
      .select("first_live_order_email_at")
      .eq("id", supplierId)
      .single();
    return (data?.first_live_order_email_at as string | null) ?? null;
  }

  it("(c) Testmodus-Versand: kein Hinweis, Timestamp bleibt NULL", async () => {
    await setTestMode(true);
    const orderId = await mkOrder("ORD-BMA-TEST-1");
    captured.length = 0;
    await sendOrderEmailWithAdmin(org.service, org.orgId, orderId);
    expect(captured).toHaveLength(1);
    expect(captured[0].html).not.toContain(NOTICE_SNIPPET);
    expect(captured[0].text).not.toContain(NOTICE_SNIPPET);
    expect(await readFirstLive()).toBeNull();
  });

  it("(a) erster Echt-Versand: Hinweisblock + Timestamp gesetzt", async () => {
    await setTestMode(false);
    const orderId = await mkOrder("ORD-BMA-LIVE-1");
    captured.length = 0;
    await sendOrderEmailWithAdmin(org.service, org.orgId, orderId);
    expect(captured).toHaveLength(1);
    expect(captured[0].to).toBe("lieferant@example.com");
    expect(captured[0].html).toContain(NOTICE_SNIPPET);
    expect(captured[0].text).toContain(NOTICE_SNIPPET);
    const ts = await readFirstLive();
    expect(ts).not.toBeNull();
  });

  it("(b) zweiter Echt-Versand: kein Hinweis, Timestamp unverändert", async () => {
    const before = await readFirstLive();
    expect(before).not.toBeNull();
    const orderId = await mkOrder("ORD-BMA-LIVE-2");
    captured.length = 0;
    await sendOrderEmailWithAdmin(org.service, org.orgId, orderId);
    expect(captured).toHaveLength(1);
    expect(captured[0].html).not.toContain(NOTICE_SNIPPET);
    expect(captured[0].text).not.toContain(NOTICE_SNIPPET);
    expect(await readFirstLive()).toBe(before);
  });
});
