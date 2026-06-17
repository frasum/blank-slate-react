// Server-Functions für PIN- und Badge-Login.
//
// Architektur (B1b): kein Edge-Function-Layer. Beide Flüsse laufen
// als createServerFn in der Worker-Runtime, supabaseAdmin wird ERST
// im Handler geladen (await import) — sonst leakt client.server ins
// Browser-Bundle (siehe tanstack-supabase-import-graph).
//
// Sicherheit:
//   * Diese Functions sind absichtlich öffentlich (kein requireSupabaseAuth).
//     Sie sind der Login-Endpunkt — vor dem Login gibt es keine Session.
//   * Jede Ablehnung liefert exakt denselben Fehlertext nach außen
//     ("Anmeldung fehlgeschlagen"), egal ob unbekannt/falsch/gesperrt/widerrufen.
//   * Reine Validierungslogik ist in pin-validation.ts isoliert getestet.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { evaluatePin, PIN_RATE_LIMIT_WINDOW_MS } from "./pin-validation";

const FAILED_MESSAGE = "Anmeldung fehlgeschlagen";

function failed(): never {
  throw new Error(FAILED_MESSAGE);
}

/**
 * Stellt sicher, dass es zu einem staff_id einen auth.users-Eintrag
 * und einen user_links-Eintrag gibt. Liefert die zugehörige E-Mail
 * (für admin.generateLink).
 *
 * Achtung: Nur innerhalb von Server-Functions aufrufen — supabaseAdmin
 * wird per dynamic import geladen, damit das Modul nicht ins Client-
 * Bundle leakt.
 */
async function ensureShadowUser(staffId: string, organizationId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: link, error: linkSelectErr } = await supabaseAdmin
    .from("user_links")
    .select("user_id")
    .eq("staff_id", staffId)
    .maybeSingle();
  // eslint-disable-next-line no-console
  if (linkSelectErr) console.error("[pin-login] linkSelect error:", linkSelectErr);
  if (linkSelectErr) failed();

  if (link) {
    const { data: existing, error: getErr } = await supabaseAdmin.auth.admin.getUserById(
      link.user_id,
    );
    // eslint-disable-next-line no-console
    if (getErr || !existing.user?.email)
      console.error("[pin-login] getUserById error / keine email:", getErr);
    if (getErr || !existing.user?.email) failed();
    return existing.user.email;
  }

  const email = `staff-${staffId}@internal.invalid`;
  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { staff_id: staffId },
  });
  // eslint-disable-next-line no-console
  if (createErr || !created.user) console.error("[pin-login] createUser error:", createErr);
  if (createErr || !created.user) failed();

  const { error: insertErr } = await supabaseAdmin.from("user_links").insert({
    user_id: created.user.id,
    staff_id: staffId,
    organization_id: organizationId,
  });
  // eslint-disable-next-line no-console
  if (insertErr) console.error("[pin-login] user_links insert error:", insertErr);
  if (insertErr) failed();

  return email;
}

/**
 * Erzeugt einen Magic-Link für die Shadow-E-Mail und gibt den hashed_token
 * zurück. Der Client verifiziert ihn mit supabase.auth.verifyOtp.
 */
async function generateSessionTokenHash(email: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  // eslint-disable-next-line no-console
  if (error || !data.properties?.hashed_token)
    console.error("[pin-login] generateLink error:", error);
  if (error || !data.properties?.hashed_token) failed();
  return data.properties.hashed_token;
}

// =========================================================================
// PIN-Login
// =========================================================================

export const validatePin = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        firstName: z.string().trim().min(1).max(64),
        pin: z.string().min(1).max(32),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const bcrypt = (await import("bcryptjs")).default;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Namens-basiertes PIN-Login: Treffer auf first_name ODER display_name
    // (exakt, case-insensitive) — MA können sich mit legalem Vornamen oder
    // Nickname anmelden. Konflikte/Mehrfachtreffer werden über den PIN
    // aufgelöst (Loop unten prüft je Kandidat den PIN). Generische
    // Fehlermeldung bleibt bei 0 Treffern.
    const term = data.firstName.trim().replace(/"/g, ""); // " kann den .or-Filter brechen
    const { data: candidates, error: staffErr } = await supabaseAdmin
      .from("staff")
      .select("id, organization_id, is_active, first_name")
      .or(`first_name.ilike."${term}",display_name.ilike."${term}"`)
      .eq("is_active", true);
    // eslint-disable-next-line no-console
    if (staffErr) console.error("[pin-login] candidate query error:", staffErr);
    if (staffErr) failed();
    // eslint-disable-next-line no-console
    if (!candidates || candidates.length === 0)
      console.error("[pin-login] keine Kandidaten für Name:", data.firstName.trim());
    if (!candidates || candidates.length === 0) failed();

    const sinceIso = new Date(Date.now() - PIN_RATE_LIMIT_WINDOW_MS).toISOString();
    const matches: { id: string; organization_id: string }[] = [];

    for (const cand of candidates) {
      const { data: pinRow } = await supabaseAdmin
        .from("staff_pins")
        .select("pin_hash")
        .eq("staff_id", cand.id)
        .maybeSingle();

      const { count } = await supabaseAdmin
        .from("pin_attempts")
        .select("id", { count: "exact", head: true })
        .eq("staff_id", cand.id)
        .gte("attempted_at", sinceIso);

      const outcome = await evaluatePin({
        storedHash: pinRow?.pin_hash ?? null,
        providedPin: data.pin,
        recentFailuresInWindow: count ?? 0,
        compare: (pin, hash) => bcrypt.compare(pin, hash),
      });

      if (outcome.kind === "ok") {
        matches.push({ id: cand.id, organization_id: cand.organization_id });
      } else if (outcome.reasonCode === "mismatch") {
        // Fehlversuch nur loggen, wenn ein Hash existiert und nicht passt.
        await supabaseAdmin.from("pin_attempts").insert({
          organization_id: cand.organization_id,
          staff_id: cand.id,
        });
      }
    }

    // Eindeutig genau einer? Sonst generische Ablehnung (keine Auskunft,
    // ob 0 oder >1 Treffer — verhindert Enumeration).
    // eslint-disable-next-line no-console
    if (matches.length !== 1) console.error("[pin-login] matches.length:", matches.length);
    if (matches.length !== 1) failed();
    const winner = matches[0];

    const email = await ensureShadowUser(winner.id, winner.organization_id);
    const session_token_hash = await generateSessionTokenHash(email);
    return { session_token_hash };
  });

// =========================================================================
// Badge-Login
// =========================================================================

export const resolveBadgeToken = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ token: z.string().min(1).max(256) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: tokenRow, error: tokenErr } = await supabaseAdmin
      .from("access_tokens")
      .select("id, organization_id, staff_id, token_type, expires_at, used_at")
      .eq("token", data.token)
      .maybeSingle();
    if (tokenErr) failed();
    if (!tokenRow) failed();
    if (tokenRow.token_type !== "badge_login") failed();
    if (!tokenRow.staff_id) failed();
    if (tokenRow.used_at !== null) failed(); // widerrufen
    if (tokenRow.expires_at && new Date(tokenRow.expires_at) <= new Date()) failed();

    const { data: staff, error: staffErr } = await supabaseAdmin
      .from("staff")
      .select("id, organization_id, is_active")
      .eq("id", tokenRow.staff_id)
      .maybeSingle();
    if (staffErr) failed();
    if (!staff || !staff.is_active) failed();

    // Badge-Tokens werden bei Login NICHT als used markiert (wiederverwendbar).
    // used_at ist der Widerrufsmechanismus, nicht ein Verbrauchszähler.

    const email = await ensureShadowUser(staff.id, staff.organization_id);
    const session_token_hash = await generateSessionTokenHash(email);
    return { session_token_hash };
  });
