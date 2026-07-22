// SEC-02 — SELECT-Policies auf order_replies und order_reply_attachments
// filtern zusätzlich per has_min_permission('manager'). Läuft nur unter
// `SUPABASE_DB_TESTS=1` (siehe src/test/db-setup.ts).
//
// Abgedeckt:
//   (a) staff-Client sieht KEINE order_replies der eigenen Org
//   (b) staff-Client sieht KEINE order_reply_attachments der eigenen Org
//   (c) manager-Client sieht beide Zeilen (Regressionsschutz gegen deny-all)

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { dbTestsEnabled, seedOrg, signInAsUser, type SeededOrg } from "@/test/db-setup";

// SL2-R (§103): Retry-Hülle für Service-Seed-Inserts. Vorbild ist
// `withDbInsertRetry` in `src/test/db-setup.ts` — der lokale
// Supabase-Stack liefert beim Kaltstart sporadisch „invalid response
// was received from the upstream server". Nur beforeAll-Setup ist
// gewrappt, Assertions bleiben unverändert.
const UPSTREAM_BOOT_ERROR = "invalid response was received from the upstream server";
async function retry<TResult extends { error: { message: string } | null }>(
  label: string,
  operation: () => PromiseLike<TResult>,
): Promise<TResult> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = await operation();
    const msg = result.error?.message.toLowerCase() ?? "";
    if (!msg.includes(UPSTREAM_BOOT_ERROR) || attempt === 3) return result;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${label} retry loop exhausted unexpectedly`);
}

describe.skipIf(!dbTestsEnabled)("order-replies RLS (SEC-02)", () => {
  let org: SeededOrg;
  let staffEmail: string;
  let staffPassword: string;
  let managerEmail: string;
  let managerPassword: string;
  let replyId: string;
  let attachmentId: string;

  beforeAll(async () => {
    org = await seedOrg("order-replies-rls");
    const staff = await org.mkUser("staff");
    const manager = await org.mkUser("manager");
    staffEmail = staff.email;
    staffPassword = staff.password;
    managerEmail = manager.email;
    managerPassword = manager.password;

    const { data: reply, error: replyErr } = await retry("reply seed", () =>
      org.service
        .from("order_replies")
        .insert({
          organization_id: org.orgId,
          from_email: "sec02@example.com",
          message_id: `sec02-${Date.now()}@mail`,
        })
        .select("id")
        .single(),
    );
    if (replyErr || !reply) throw new Error(`reply insert failed: ${replyErr?.message}`);
    replyId = reply.id as string;

    const { data: att, error: attErr } = await retry("attachment seed", () =>
      org.service
        .from("order_reply_attachments")
        .insert({
          organization_id: org.orgId,
          reply_id: replyId,
          file_name: "brief.pdf",
          content_type: "application/pdf",
          size_bytes: 1024,
          storage_path: `sec02/${replyId}/brief.pdf`,
        })
        .select("id")
        .single(),
    );
    if (attErr || !att) throw new Error(`attachment insert failed: ${attErr?.message}`);
    attachmentId = att.id as string;
  });

  afterAll(async () => {
    await org.service.from("order_reply_attachments").delete().eq("organization_id", org.orgId);
    await org.service.from("order_replies").delete().eq("organization_id", org.orgId);
    await org.cleanup();
  });

  it("(a) staff sieht KEINE order_replies der eigenen Org", async () => {
    const client = await signInAsUser(staffEmail, staffPassword);
    const { data, error } = await client.from("order_replies").select("id").eq("id", replyId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("(b) staff sieht KEINE order_reply_attachments der eigenen Org", async () => {
    const client = await signInAsUser(staffEmail, staffPassword);
    const { data, error } = await client
      .from("order_reply_attachments")
      .select("id")
      .eq("id", attachmentId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("(c) manager sieht Reply UND Attachment der eigenen Org", async () => {
    const client = await signInAsUser(managerEmail, managerPassword);
    const { data: replies, error: replyErr } = await client
      .from("order_replies")
      .select("id")
      .eq("id", replyId);
    expect(replyErr).toBeNull();
    expect(replies ?? []).toHaveLength(1);

    const { data: atts, error: attErr } = await client
      .from("order_reply_attachments")
      .select("id")
      .eq("id", attachmentId);
    expect(attErr).toBeNull();
    expect(atts ?? []).toHaveLength(1);
  });
});
