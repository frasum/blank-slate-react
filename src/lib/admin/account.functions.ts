// Konto-Verwaltung für Mitarbeiter (Teil A des Login-Umbaus).
//
// Alle schreibenden Aktionen sind admin-only und laufen über runGuarded
// (Rollencheck VOR DB-Schreiben, audit_log NUR bei Erfolg).
// supabaseAdmin wird im Handler dynamic-importiert (kein Leak ins Client-Bundle).
//
// Sicherheit:
// - Standardpasswort wird hier erzeugt und EINMAL als Klartext zurückgegeben.
//   Der Klartext wird NICHT in der DB gespeichert, NICHT geloggt — die UI ist
//   die einzige Stelle, an der er sichtbar wird.
// - must_change_password=true zwingt den Mitarbeiter beim nächsten Login zum
//   eigenen Passwort.

import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "./admin-context";
import { runGuarded } from "./admin-call";
import { makeAuditWriter } from "./audit";
import { generateStandardPassword } from "./password-generator";
import { expectMaybe, expectVoid } from "@/lib/supabase/expect-ok";

// =========================================================================
// Status lesen (admin/manager)
// =========================================================================

export const getStaffAccountStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ staffId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // H2-BEFUND: reine Anzeige-Kante — Fehler werden bewusst still gerendert
    // („kein Konto verknüpft"). Nicht auf expectMaybe umgestellt, weil ein
    // PostgREST-Ausfall hier die Status-Kachel leer lassen soll, statt die
    // Verwaltung-Übersicht mit einem harten Fehler zu blockieren.
    const { data: link } = await supabaseAdmin
      .from("user_links")
      .select("user_id")
      .eq("staff_id", data.staffId)
      .eq("organization_id", caller.organizationId)
      .maybeSingle();

    // H2-BEFUND: siehe oben — Anzeige-Kante, absichtlich still.
    const { data: staff } = await supabaseAdmin
      .from("staff")
      .select("email, must_change_password")
      .eq("id", data.staffId)
      .eq("organization_id", caller.organizationId)
      .maybeSingle();

    let authEmail: string | null = null;
    if (link?.user_id) {
      // H2-BEFUND: Auth-Admin-Read für Anzeige; Fehler dürfen den Status
      // nicht kippen (E-Mail wird dann als null angezeigt).
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(link.user_id);
      authEmail = u?.user?.email ?? null;
    }

    return {
      hasAccount: !!link?.user_id,
      email: authEmail,
      staffEmail: staff?.email ?? null,
      mustChangePassword: staff?.must_change_password ?? false,
    };
  });

// =========================================================================
// Konto anlegen (admin)
// =========================================================================

const createSchema = z.object({
  staffId: z.string().uuid(),
  email: z.string().trim().min(3).max(254),
});

export const createStaffAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      // Verifizieren: staff gehört zur Org und hat noch kein Konto.
      const staff = expectMaybe<{ id: string; organization_id: string }>(
        await supabaseAdmin
          .from("staff")
          .select("id, organization_id")
          .eq("id", data.staffId)
          .eq("organization_id", caller.organizationId)
          .maybeSingle(),
        "createStaffAccount.loadStaff",
      );
      if (!staff) throw new Error("Mitarbeiter nicht gefunden.");

      const existingLink = expectMaybe<{ user_id: string }>(
        await supabaseAdmin
          .from("user_links")
          .select("user_id")
          .eq("staff_id", data.staffId)
          .maybeSingle(),
        "createStaffAccount.checkExistingLink",
      );
      if (existingLink?.user_id) {
        throw new Error("Dieser Mitarbeiter hat bereits ein Konto.");
      }

      const password = generateStandardPassword();

      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password,
        email_confirm: true,
        app_metadata: { staff_id: data.staffId },
      });
      if (createErr || !created.user) {
        throw new Error(createErr?.message ?? "Konto konnte nicht erstellt werden.");
      }

      const { error: linkErr } = await supabaseAdmin.rpc("link_account_to_staff", {
        p_staff_id: data.staffId,
        p_organization_id: staff.organization_id,
        p_user_id: created.user.id,
        p_email: data.email,
      });
      if (linkErr) {
        // Saga-Kompensation: Auth-User wieder entfernen, damit keine verwaiste
        // E-Mail in Supabase Auth zurückbleibt. Best-effort — ein Fehler beim
        // Löschen darf den ursprünglichen Fehler nicht überschreiben.
        await supabaseAdmin.auth.admin.deleteUser(created.user.id).catch(() => {});
        throw linkErr;
      }

      return {
        // Passwort wird NUR hier (Antwort an die UI) zurückgegeben.
        result: { password, email: data.email },
        audit: {
          action: "staff.account_created",
          entity: "staff",
          entityId: data.staffId,
          meta: { email: data.email },
        },
      };
    });
  });

// =========================================================================
// Passwort zurücksetzen (admin)
// =========================================================================

export const resetStaffPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ staffId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const link = expectMaybe<{ user_id: string; organization_id: string }>(
        await supabaseAdmin
          .from("user_links")
          .select("user_id, organization_id")
          .eq("staff_id", data.staffId)
          .maybeSingle(),
        "resetStaffPassword.loadLink",
      );
      if (!link?.user_id || link.organization_id !== caller.organizationId) {
        throw new Error("Mitarbeiter hat noch kein Konto.");
      }

      const password = generateStandardPassword();
      const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(link.user_id, {
        password,
      });
      if (updErr) throw updErr;

      expectVoid(
        await supabaseAdmin
          .from("staff")
          .update({ must_change_password: true })
          .eq("id", data.staffId),
        "resetStaffPassword.setMustChange",
      );

      return {
        result: { password },
        audit: {
          action: "staff.password_reset",
          entity: "staff",
          entityId: data.staffId,
        },
      };
    });
  });

// =========================================================================
// Einladung erneut senden (admin) — für Konten, die bereits verknüpft sind
// =========================================================================
//
// Erzeugt einen Recovery-Link für den bereits vorhandenen Auth-User und
// versendet ihn per MailerSend. Ändert weder Passwort noch must_change_password.
// Der action_link wird nicht ins Audit/Log geschrieben.

export const resendStaffInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ staffId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const link = expectMaybe<{ user_id: string; organization_id: string }>(
        await supabaseAdmin
          .from("user_links")
          .select("user_id, organization_id")
          .eq("staff_id", data.staffId)
          .maybeSingle(),
        "resendStaffInvite.loadLink",
      );
      if (!link?.user_id || link.organization_id !== caller.organizationId) {
        throw new Error("Mitarbeiter hat noch kein Konto.");
      }

      const { data: userRes, error: userErr } = await supabaseAdmin.auth.admin.getUserById(
        link.user_id,
      );
      if (userErr || !userRes?.user?.email) {
        throw new Error(userErr?.message ?? "E-Mail des Kontos konnte nicht ermittelt werden.");
      }
      const email = userRes.user.email;

      const origin = resolveRequestOrigin();
      const redirectTo = `${origin}/reset-password`;

      const { data: linkRes, error: genErr } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo },
      });
      if (genErr || !linkRes?.properties?.action_link) {
        throw new Error(genErr?.message ?? "Einladungslink konnte nicht erstellt werden.");
      }

      await sendInviteEmail(email, linkRes.properties.action_link);

      return {
        result: { email },
        audit: {
          action: "staff.account_invite_resent",
          entity: "staff",
          entityId: data.staffId,
          meta: { email },
        },
      };
    });
  });

// =========================================================================
// Konto per E-Mail einladen (admin)
// =========================================================================
//
// Legt den Auth-User über generateLink({type:'invite'}) an, verknüpft ihn
// per link_account_to_staff-RPC mit dem Mitarbeiter und versendet den
// Invite-Link über MailerSend. Der Mitarbeiter klickt den Link, landet
// auf /reset-password und vergibt sein eigenes Passwort — kein
// Standardpasswort wird zwischen Admin und Mitarbeiter weitergegeben.
//
// Kompensation: schlägt link_account_to_staff oder der Mailversand fehl,
// werden Auth-User und user_links wieder entfernt, damit „Einladen"
// erneut möglich ist. Der action_link wird niemals ins Audit oder in
// Logs geschrieben — nur an MailerSend übergeben.

const inviteSchema = z.object({
  staffId: z.string().uuid(),
  email: z.string().trim().email().max(254),
});

export const inviteStaffByEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inviteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const staff = expectMaybe<{ id: string; organization_id: string }>(
        await supabaseAdmin
          .from("staff")
          .select("id, organization_id")
          .eq("id", data.staffId)
          .eq("organization_id", caller.organizationId)
          .maybeSingle(),
        "inviteStaffByEmail.loadStaff",
      );
      if (!staff) throw new Error("Mitarbeiter nicht gefunden.");

      const existingLink = expectMaybe<{ user_id: string }>(
        await supabaseAdmin
          .from("user_links")
          .select("user_id")
          .eq("staff_id", data.staffId)
          .maybeSingle(),
        "inviteStaffByEmail.checkExistingLink",
      );
      if (existingLink?.user_id) {
        throw new Error("Dieser Mitarbeiter hat bereits ein Konto.");
      }

      const origin = resolveRequestOrigin();
      const redirectTo = `${origin}/reset-password`;

      const { data: linkRes, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: "invite",
        email: data.email,
        options: {
          redirectTo,
          data: { staff_id: data.staffId },
        },
      });
      if (linkErr || !linkRes?.properties?.action_link || !linkRes.user) {
        throw new Error(linkErr?.message ?? "Einladungslink konnte nicht erstellt werden.");
      }
      const actionLink = linkRes.properties.action_link;
      const authUserId = linkRes.user.id;

      const { error: rpcErr } = await supabaseAdmin.rpc("link_account_to_staff", {
        p_staff_id: data.staffId,
        p_organization_id: staff.organization_id,
        p_user_id: authUserId,
        p_email: data.email,
      });
      if (rpcErr) {
        await supabaseAdmin.auth.admin.deleteUser(authUserId).catch(() => {});
        throw rpcErr;
      }

      try {
        await sendInviteEmail(data.email, actionLink);
      } catch (mailErr) {
        // Saga-Kompensation: user_links + Auth-User zurückrollen, damit der
        // Admin den Versand erneut versuchen kann.
        try {
          await supabaseAdmin.from("user_links").delete().eq("user_id", authUserId);
        } catch {
          /* best-effort */
        }
        await supabaseAdmin.auth.admin.deleteUser(authUserId).catch(() => {});
        throw mailErr;
      }

      return {
        result: { email: data.email },
        audit: {
          action: "staff.account_invited",
          entity: "staff",
          entityId: data.staffId,
          // action_link bewusst NICHT ins Audit — nur die Ziel-Adresse.
          meta: { email: data.email },
        },
      };
    });
  });

function resolveRequestOrigin(): string {
  // Bevorzugt der öffentlich sichtbare Host des Requests (custom domain,
  // Preview-URL, published URL). Fallback auf published URL.
  const forwardedProto = getRequestHeader("x-forwarded-proto");
  const forwardedHost = getRequestHeader("x-forwarded-host");
  const host = forwardedHost ?? getRequestHeader("host") ?? "";
  const proto = forwardedProto ?? "https";
  if (host) return `${proto}://${host}`;
  return "https://cocoplatform.online";
}

async function sendInviteEmail(toEmail: string, actionLink: string): Promise<void> {
  const apiKey = process.env.MAILERSEND_API_KEY;
  const fromEmail = process.env.MAILERSEND_FROM_EMAIL;
  const fromName = process.env.MAILERSEND_FROM_NAME ?? "COCO";
  if (!apiKey) throw new Error("Mailversand ist nicht konfiguriert (MAILERSEND_API_KEY fehlt).");
  if (!fromEmail) throw new Error("Absenderadresse fehlt (MAILERSEND_FROM_EMAIL).");

  const subject = "Dein COCO-Konto: Passwort festlegen";
  const html = buildInviteHtml(actionLink);
  const text = buildInviteText(actionLink);

  const res = await fetch("https://api.mailersend.com/v1/email", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: JSON.stringify({
      from: { email: fromEmail, name: fromName },
      to: [{ email: toEmail }],
      subject,
      html,
      text,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Body kann personenbezogene Fehlerdetails enthalten — nur gekürzt und
    // ohne action_link (der ist nicht Teil der Antwort).
    throw new Error(`Einladungs-E-Mail fehlgeschlagen (${res.status}). ${body.slice(0, 200)}`);
  }
}

function buildInviteHtml(actionLink: string): string {
  const safeLink = escapeHtml(actionLink);
  return `<!doctype html>
<html lang="de"><body style="margin:0;padding:24px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f6f6;color:#111;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:8px;padding:28px;">
    <h1 style="margin:0 0 12px;font-size:20px;">Willkommen bei COCO</h1>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">
      Für dich wurde ein Konto angelegt. Klicke auf den Button, um dein Passwort
      festzulegen und dich anzumelden.
    </p>
    <p style="margin:24px 0;">
      <a href="${safeLink}"
         style="display:inline-block;background:#111;color:#fff;text-decoration:none;
                padding:12px 20px;border-radius:6px;font-size:14px;font-weight:500;">
        Passwort festlegen
      </a>
    </p>
    <p style="margin:0 0 8px;font-size:12px;color:#666;">
      Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:
    </p>
    <p style="margin:0;font-size:12px;color:#666;word-break:break-all;">${safeLink}</p>
    <p style="margin:24px 0 0;font-size:12px;color:#666;">
      Der Link ist einmalig gültig. Wenn du diese E-Mail unerwartet erhalten hast,
      kannst du sie ignorieren.
    </p>
  </div>
</body></html>`;
}

function buildInviteText(actionLink: string): string {
  return [
    "Willkommen bei COCO",
    "",
    "Für dich wurde ein Konto angelegt. Öffne den folgenden Link, um dein",
    "Passwort festzulegen und dich anzumelden:",
    "",
    actionLink,
    "",
    "Der Link ist einmalig gültig. Wenn du diese E-Mail unerwartet erhalten",
    "hast, kannst du sie ignorieren.",
  ].join("\n");
}

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
