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
  if (linkSelectErr) failed();

  if (link) {
    const { data: existing, error: getErr } = await supabaseAdmin.auth.admin.getUserById(
      link.user_id,
    );
    if (getErr || !existing.user?.email) failed();
    return existing.user.email;
  }

  const email = `staff-${staffId}@internal.invalid`;
  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { staff_id: staffId },
  });
  if (createErr || !created.user) failed();

  const { error: insertErr } = await supabaseAdmin.from("user_links").insert({
    user_id: created.user.id,
    staff_id: staffId,
    organization_id: organizationId,
  });
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
        staffId: z.string().uuid(),
        pin: z.string().min(1).max(32),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const bcrypt = (await import("bcryptjs")).default;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: staff, error: staffErr } = await supabaseAdmin
      .from("staff")
      .select("id, organization_id, is_active")
      .eq("id", data.staffId)
      .maybeSingle();
    if (staffErr) failed();
    // Unbekannter oder inaktiver Staff: keine pin_attempts-Zeile (kein FK-Ziel
    // für append-only Log), gleiche Fehlerantwort.
    if (!staff || !staff.is_active) failed();

    const { data: pinRow, error: pinErr } = await supabaseAdmin
      .from("staff_pins")
      .select("pin_hash")
      .eq("staff_id", staff.id)
      .maybeSingle();
    if (pinErr) failed();

    const sinceIso = new Date(Date.now() - PIN_RATE_LIMIT_WINDOW_MS).toISOString();
    const { count, error: countErr } = await supabaseAdmin
      .from("pin_attempts")
      .select("id", { count: "exact", head: true })
      .eq("staff_id", staff.id)
      .gte("attempted_at", sinceIso);
    if (countErr) failed();

    const outcome = await evaluatePin({
      storedHash: pinRow?.pin_hash ?? null,
      providedPin: data.pin,
      recentFailuresInWindow: count ?? 0,
      compare: (pin, hash) => bcrypt.compare(pin, hash),
    });

    if (outcome.kind === "rejected") {
      // Bei rate_limited keinen zusätzlichen Eintrag schreiben (würde das
      // Fenster künstlich verlängern). Bei mismatch/no_pin loggen.
      if (outcome.reasonCode !== "rate_limited") {
        await supabaseAdmin.from("pin_attempts").insert({
          organization_id: staff.organization_id,
          staff_id: staff.id,
        });
      }
      failed();
    }

    const email = await ensureShadowUser(staff.id, staff.organization_id);
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