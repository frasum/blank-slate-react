// BM1/K6 — DB-Integrationstests für den MailerSend-Inbound-Kern und
// die Zuordnungs-Serverfunktion. Läuft nur unter `SUPABASE_DB_TESTS=1`
// (siehe src/test/db-setup.ts).
//
// Abgedeckt:
//   (a) gültige Signatur + Plus-Adresse → Zuordnung an die Bestellung
//   (b) ungültige / fehlende Signatur → 401, keine Zeile
//   (c) doppelte message_id → idempotent (UNIQUE(org, message_id))
//   (d) unbekannte Bestellnummer → order_id NULL unter Default-Org
//   (e) DENY-ALL: authenticated darf nicht in order_replies inserten
//   (f) assignOrderReply cross-org → RLS blockiert (Order unsichtbar)
//   (g) Erfolgreiche Zuordnung → genau ein audit_log-Eintrag

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHmac } from "node:crypto";
import {
  dbTestsEnabled,
  seedOrg,
  signInAsUser,
  type SeededOrg,
  type SeededUser,
} from "@/test/db-setup";
import { processInboundEmail } from "@/routes/api/public/mailersend/webhook-core";
import { assignOrderReplyCore } from "./order-replies.functions";

const SECRET = "test-webhook-secret-please-ignore";

function sign(rawBody: string): string {
  return createHmac("sha256", SECRET).update(rawBody).digest("hex");
}

type InboundBody = {
  to?: unknown;
  from?: { email: string; name?: string };
  subject?: string;
  text?: string;
  message_id?: string;
};

function makeBody(payload: InboundBody): string {
  return JSON.stringify({ type: "inbound", data: payload });
}

describe.skipIf(!dbTestsEnabled)("order-replies (Webhook-Kern + Assign)", () => {
  let org: SeededOrg;
  let orgB: SeededOrg;
  let manager: SeededUser;
  let managerB: SeededUser;
  let supplierId: string;
  let supplierIdB: string;
  let orderIdA: string;
  let orderIdB: string;
  let orderNumberA: string;
  let orderNumberB: string;

  beforeAll(async () => {
    org = await seedOrg("order-replies");
    orgB = await seedOrg("order-replies-b");
    manager = await org.mkUser("manager");
    managerB = await orgB.mkUser("manager");

    const mkSupplier = async (o: SeededOrg) => {
      const { data } = await o.service
        .from("suppliers")
        .insert({ organization_id: o.orgId, name: "Lieferant", email: "l@example.com" })
        .select("id")
        .single();
      return data!.id as string;
    };
    supplierId = await mkSupplier(org);
    supplierIdB = await mkSupplier(orgB);

    const mkOrder = async (o: SeededOrg, supplier: string, num: string) => {
      const { data } = await o.service
        .from("orders")
        .insert({
          organization_id: o.orgId,
          supplier_id: supplier,
          location_id: o.defaultLocationId,
          order_number: num,
          status: "sent",
          total_amount_cents: 0,
        })
        .select("id")
        .single();
      return data!.id as string;
    };
    orderNumberA = "ORD-2026-07-9001";
    orderNumberB = "ORD-2026-07-9002";
    orderIdA = await mkOrder(org, supplierId, orderNumberA);
    orderIdB = await mkOrder(orgB, supplierIdB, orderNumberB);
  });

  afterAll(async () => {
    await org.service.from("order_replies").delete().eq("organization_id", org.orgId);
    await orgB.service.from("order_replies").delete().eq("organization_id", orgB.orgId);
    await org.service.from("orders").delete().eq("organization_id", org.orgId);
    await orgB.service.from("orders").delete().eq("organization_id", orgB.orgId);
    await org.service.from("suppliers").delete().eq("organization_id", org.orgId);
    await orgB.service.from("suppliers").delete().eq("organization_id", orgB.orgId);
    await org.cleanup();
    await orgB.cleanup();
  });

  it("(a) gültige Signatur + Plus-Adresse → ordnet an Bestellung zu", async () => {
    const body = makeBody({
      to: `antwort+${orderNumberA}@inbound.cocoplatform.online`,
      from: { email: "supplier@example.com", name: "Lieferant" },
      subject: "Re: Bestellung",
      text: "Bestätigt.",
      message_id: `mid-a-${Date.now()}@mail`,
    });
    const res = await processInboundEmail({
      rawBody: body,
      signatureHeader: sign(body),
      secret: SECRET,
      supabaseAdmin: org.service,
      defaultOrgId: undefined,
    });
    expect(res.status).toBe(200);
    const { data } = await org.service
      .from("order_replies")
      .select("order_id, organization_id")
      .eq("organization_id", org.orgId)
      .eq("from_email", "supplier@example.com");
    expect(data).toHaveLength(1);
    expect(data![0].order_id).toBe(orderIdA);
  });

  it("(b) fehlende/ungültige Signatur → 401, keine Zeile", async () => {
    const body = makeBody({
      to: `antwort+${orderNumberA}@inbound.cocoplatform.online`,
      from: { email: "attacker@example.com" },
      subject: "spoof",
      text: "no",
      message_id: `mid-b-${Date.now()}@mail`,
    });
    const missing = await processInboundEmail({
      rawBody: body,
      signatureHeader: null,
      secret: SECRET,
      supabaseAdmin: org.service,
      defaultOrgId: undefined,
    });
    expect(missing.status).toBe(401);
    const wrong = await processInboundEmail({
      rawBody: body,
      signatureHeader: "deadbeef",
      secret: SECRET,
      supabaseAdmin: org.service,
      defaultOrgId: undefined,
    });
    expect(wrong.status).toBe(401);
    const { count } = await org.service
      .from("order_replies")
      .select("id", { count: "exact", head: true })
      .eq("from_email", "attacker@example.com");
    expect(count ?? 0).toBe(0);
  });

  it("(b2) leerer POST → 200, keine Zeile (MailerSend-Validierungs-Ping)", async () => {
    const beforeRes = await org.service
      .from("order_replies")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.orgId);
    const before = beforeRes.count ?? 0;
    const res = await processInboundEmail({
      rawBody: "",
      signatureHeader: null,
      secret: SECRET,
      supabaseAdmin: org.service,
      defaultOrgId: org.orgId,
    });
    expect(res.status).toBe(200);
    const afterRes = await org.service
      .from("order_replies")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.orgId);
    expect(afterRes.count ?? 0).toBe(before);
  });

  it("(c) doppelte message_id → idempotent (nur eine Zeile)", async () => {
    const mid = `mid-c-${Date.now()}@mail`;
    const body = makeBody({
      to: `antwort+${orderNumberA}@inbound.cocoplatform.online`,
      from: { email: "dup@example.com" },
      subject: "Bestätigt",
      text: "hi",
      message_id: mid,
    });
    const sig = sign(body);
    const r1 = await processInboundEmail({
      rawBody: body,
      signatureHeader: sig,
      secret: SECRET,
      supabaseAdmin: org.service,
      defaultOrgId: undefined,
    });
    const r2 = await processInboundEmail({
      rawBody: body,
      signatureHeader: sig,
      secret: SECRET,
      supabaseAdmin: org.service,
      defaultOrgId: undefined,
    });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const { count } = await org.service
      .from("order_replies")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.orgId)
      .eq("message_id", mid);
    expect(count).toBe(1);
  });

  it("(d) unbekannte Bestellnummer → order_id NULL unter Default-Org (Env)", async () => {
    const body = makeBody({
      to: "antwort+ORD-2099-01-0001@inbound.cocoplatform.online",
      from: { email: "unknown@example.com" },
      subject: "kein Bezug",
      text: "hmm",
      message_id: `mid-d-${Date.now()}@mail`,
    });
    const res = await processInboundEmail({
      rawBody: body,
      signatureHeader: sign(body),
      secret: SECRET,
      supabaseAdmin: org.service,
      defaultOrgId: org.orgId,
    });
    expect(res.status).toBe(200);
    const { data } = await org.service
      .from("order_replies")
      .select("order_id, organization_id")
      .eq("organization_id", org.orgId)
      .eq("from_email", "unknown@example.com");
    expect(data).toHaveLength(1);
    expect(data![0].order_id).toBeNull();
  });

  it("(e) DENY-ALL: authenticated darf nicht in order_replies inserten", async () => {
    const client = await signInAsUser(manager.email, manager.password);
    const { error } = await client.from("order_replies").insert({
      organization_id: org.orgId,
      from_email: "hacker@example.com",
      message_id: `mid-e-${Date.now()}@mail`,
    });
    expect(error).not.toBeNull();
  });

  it("(f) assignOrderReply cross-org → geblockt (Order unsichtbar per RLS)", async () => {
    // Reply in Org A anlegen, Manager aus Org B versucht sie an eine Order
    // aus Org B zu hängen — RLS versteckt die Reply, Guard schlägt an.
    const mid = `mid-f-${Date.now()}@mail`;
    const { data: reply } = await org.service
      .from("order_replies")
      .insert({
        organization_id: org.orgId,
        from_email: "crossorg@example.com",
        message_id: mid,
      })
      .select("id")
      .single();
    const clientB = await signInAsUser(managerB.email, managerB.password);
    await expect(
      assignOrderReplyCore({
        authed: clientB,
        admin: orgB.service,
        userId: managerB.userId,
        staffId: managerB.staffId,
        replyId: reply!.id as string,
        orderId: orderIdB,
      }),
    ).rejects.toThrow(/Antwort nicht gefunden|nicht in derselben Organisation/);
    // Und die eigentliche Zuordnung wurde nicht geschrieben.
    const { data: unchanged } = await org.service
      .from("order_replies")
      .select("order_id")
      .eq("id", reply!.id as string)
      .single();
    expect(unchanged?.order_id).toBeNull();
  });

  it("(g) Erfolgreiche Zuordnung schreibt genau einen audit_log-Eintrag", async () => {
    const mid = `mid-g-${Date.now()}@mail`;
    const { data: reply } = await org.service
      .from("order_replies")
      .insert({
        organization_id: org.orgId,
        from_email: "assign@example.com",
        message_id: mid,
      })
      .select("id")
      .single();
    const clientA = await signInAsUser(manager.email, manager.password);
    const beforeRes = await org.service
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.orgId)
      .eq("action", "order_reply.assign");
    const before = beforeRes.count ?? 0;
    await assignOrderReplyCore({
      authed: clientA,
      admin: org.service,
      userId: manager.userId,
      staffId: manager.staffId,
      replyId: reply!.id as string,
      orderId: orderIdA,
    });
    const afterRes = await org.service
      .from("audit_log")
      .select("entity_id", { count: "exact" })
      .eq("organization_id", org.orgId)
      .eq("action", "order_reply.assign")
      .eq("entity_id", reply!.id as string);
    expect((afterRes.count ?? 0) - before).toBeGreaterThanOrEqual(0);
    expect(afterRes.data ?? []).toHaveLength(1);
    const { data: row } = await org.service
      .from("order_replies")
      .select("order_id, assigned_at")
      .eq("id", reply!.id as string)
      .single();
    expect(row?.order_id).toBe(orderIdA);
    expect(row?.assigned_at).not.toBeNull();
  });
});
