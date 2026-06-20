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
import { evaluatePin, PIN_RATE_LIMIT_WINDOW_MS } from "./pin-validation";
import {
  ensureShadowUser,
  failed,
  generateSessionTokenHash,
  parseBadgeLoginInput,
  parsePinLoginInput,
  validatePinLoginName,
  tryStaffPasswordLogin,
} from "./auth-flows.server";

const PIN_CREDENTIAL_PATTERN = /^\d{4,8}$/;

// =========================================================================
// PIN-Login
// =========================================================================

export const validatePin = createServerFn({ method: "POST" })
  .inputValidator(parsePinLoginInput)
  .handler(async ({ data }) => {
    const bcrypt = (await import("bcryptjs")).default;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Namens-basiertes PIN-Login: Treffer auf first_name ODER display_name
    // (exakt, case-insensitive) — MA können sich mit legalem Vornamen oder
    // Nickname anmelden. Konflikte/Mehrfachtreffer werden über den PIN
    // aufgelöst (Loop unten prüft je Kandidat den PIN). Generische
    // Fehlermeldung bleibt bei 0 Treffern.
    const term = validatePinLoginName(data.firstName);
    if (!term) {
      console.error("[pin-login] invalid name input");
      failed();
    }
    const { data: candidates, error: staffErr } = await supabaseAdmin
      .from("staff")
      .select("id, organization_id, is_active, first_name")
      .or(`first_name.ilike.${term},display_name.ilike.${term}`)
      .eq("is_active", true);
    if (staffErr) console.error("[pin-login] candidate query error:", staffErr);
    if (staffErr) failed();
    if (!candidates || candidates.length === 0)
      console.error("[pin-login] keine Kandidaten für Name:", data.firstName.trim());
    if (!candidates || candidates.length === 0) failed();

    if (!PIN_CREDENTIAL_PATTERN.test(data.pin)) {
      const sessions = [];
      for (const cand of candidates) {
        const session = await tryStaffPasswordLogin(cand.id, data.pin);
        if (session) sessions.push(session);
      }
      if (sessions.length !== 1) console.error("[password-login] matches.length:", sessions.length);
      const session = sessions[0];
      if (sessions.length !== 1 || !session) failed();
      return { kind: "password" as const, ...session };
    }

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
    if (matches.length !== 1) console.error("[pin-login] matches.length:", matches.length);
    if (matches.length !== 1) failed();
    const winner = matches[0];

    const email = await ensureShadowUser(winner.id, winner.organization_id);
    const session_token_hash = await generateSessionTokenHash(email);
    return { kind: "pin" as const, session_token_hash };
  });

// =========================================================================
// Badge-Login
// =========================================================================

export const resolveBadgeToken = createServerFn({ method: "POST" })
  .inputValidator(parseBadgeLoginInput)
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
