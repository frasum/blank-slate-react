// Server-Function für PIN-Login.
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
import { getRequest } from "@tanstack/react-start/server";
import {
  evaluatePin,
  isCredentialAttemptAllowed,
  PIN_RATE_LIMIT_WINDOW_MS,
} from "./pin-validation";
import {
  ensureShadowUser,
  failed,
  generateSessionTokenHash,
  parsePinLoginInput,
  tryStaffPasswordLogin,
  validatePinLoginName,
} from "./auth-flows.server";

// SEC-PIN2: PIN-Klassifikation weiterhin ab 4 Ziffern, damit bestehende
// 4-/5-stellige PINs (vor der Umstellung auf Mindestlänge 6) am Login
// nicht plötzlich als Passwort interpretiert werden und in den bcrypt-
// Fallback fallen. Neue PINs werden über pin-format.ts (>= 6) erzwungen.
const PIN_CREDENTIAL_PATTERN = /^\d{4,8}$/;

// SEC-RL2: IP-basiertes Limit über alle Login-Versuche im 15-Min-Fenster.
// Höher als das Staff-Limit (5), weil eine IP legitim mehrere Mitarbeiter
// bedienen kann (gemeinsame Kasse hinter NAT). Schlägt an, bevor überhaupt
// eine Kandidatensuche läuft, und erzeugt selbst keinen Log-Eintrag.
const PIN_IP_RATE_LIMIT_MAX = 30;

/** Best-effort Client-IP: Cloudflare > X-Forwarded-For (erster Eintrag) > null. */
function extractClientIp(): string | null {
  try {
    const req = getRequest();
    const h = req?.headers;
    if (!h) return null;
    const cf = h.get("cf-connecting-ip");
    if (cf) return cf.trim().slice(0, 64);
    const xff = h.get("x-forwarded-for");
    if (xff) return xff.split(",")[0]?.trim().slice(0, 64) || null;
    const xr = h.get("x-real-ip");
    if (xr) return xr.trim().slice(0, 64);
  } catch {
    // getRequest() nicht verfügbar (z. B. Test) — ohne IP arbeiten.
  }
  return null;
}

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

    const sinceIso = new Date(Date.now() - PIN_RATE_LIMIT_WINDOW_MS).toISOString();
    const clientIp = extractClientIp();

    // SEC-RL2: IP-Limit ZUERST — noch vor Kandidatensuche / bcrypt.
    if (clientIp) {
      const { count: ipCount } = await supabaseAdmin
        .from("pin_attempts")
        .select("id", { count: "exact", head: true })
        .eq("ip", clientIp)
        .gte("attempted_at", sinceIso);
      if ((ipCount ?? 0) >= PIN_IP_RATE_LIMIT_MAX) {
        console.error("[pin-login] ip rate-limited");
        failed();
      }
    }

    // SEC-ORG-LOGIN: Kandidatensuche läuft absichtlich ohne organization_id-
    // Filter — vor dem Login gibt es keine Session und die Login-UI kennt
    // die Organisation nicht. Eine Einschränkung wäre erst möglich, wenn
    // der Login-Flow einen Org-Selektor bekommt (offener Punkt).
    const { data: candidates, error: staffErr } = await supabaseAdmin
      .from("staff")
      .select("id, organization_id, is_active, first_name")
      .or(`first_name.ilike.${term},display_name.ilike.${term}`)
      .eq("is_active", true);
    if (staffErr) console.error("[pin-login] candidate query error:", staffErr);
    if (staffErr) failed();
    if (!candidates || candidates.length === 0) {
      // SEC-PIN2: KEIN Klartext-Name mehr im Log — nur die Länge, damit
      // wir massenhaften Enumerations-Traffic weiterhin erkennen können.
      console.error("[pin-login] keine Kandidaten (name-len=%d)", term?.length ?? 0);
      failed();
    }

    if (!PIN_CREDENTIAL_PATTERN.test(data.pin)) {
      // Passwort-Fallback (Eingabe ist keine reine Ziffernfolge).
      // SEC-RL1: Fehlversuch VOR dem bcrypt-Aufruf loggen, damit parallele
      // Requests das Limit nicht umgehen können. Bei Erfolg wird die
      // spekulative Zeile wieder entfernt (Erfolg zählt nicht als Fehler).
      const sessions: { access_token: string; refresh_token: string }[] = [];
      for (const cand of candidates) {
        const { count } = await supabaseAdmin
          .from("pin_attempts")
          .select("id", { count: "exact", head: true })
          .eq("staff_id", cand.id)
          .gte("attempted_at", sinceIso);
        if (!isCredentialAttemptAllowed(count ?? 0)) continue;

        const { data: preRow, error: preErr } = await supabaseAdmin
          .from("pin_attempts")
          .insert({
            organization_id: cand.organization_id,
            staff_id: cand.id,
            ip: clientIp,
          })
          .select("id")
          .single();
        if (preErr || !preRow) {
          console.error("[password-login] pre-insert error:", preErr);
          continue;
        }

        const session = await tryStaffPasswordLogin(cand.id, data.pin);
        if (session) {
          sessions.push(session);
          // Erfolg → spekulative Fail-Zeile zurücknehmen.
          await supabaseAdmin.from("pin_attempts").delete().eq("id", preRow.id);
        }
      }
      if (sessions.length !== 1) console.error("[password-login] matches.length:", sessions.length);
      const session = sessions[0];
      if (sessions.length !== 1 || !session) failed();
      return { kind: "password" as const, ...session };
    }

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

      // SEC-RL1: Spekulative Fail-Zeile VOR dem bcrypt-Vergleich schreiben,
      // damit parallele Requests im selben Fenster das Limit sehen (vorher
      // konnten N parallele Versuche gemeinsam den Zähler zurück auf < MAX
      // lesen und alle bcrypt.compare durchlaufen). Nur einfügen, wenn wir
      // überhaupt vergleichen — also Hash vorhanden und Limit noch offen.
      const willCompare = !!pinRow?.pin_hash && isCredentialAttemptAllowed(count ?? 0);
      let preId: string | null = null;
      if (willCompare) {
        const { data: preRow, error: preErr } = await supabaseAdmin
          .from("pin_attempts")
          .insert({
            organization_id: cand.organization_id,
            staff_id: cand.id,
            ip: clientIp,
          })
          .select("id")
          .single();
        if (preErr || !preRow) {
          console.error("[pin-login] pre-insert error:", preErr);
          continue;
        }
        preId = preRow.id;
      }

      const outcome = await evaluatePin({
        storedHash: pinRow?.pin_hash ?? null,
        providedPin: data.pin,
        // Wir übergeben den Zähler VOR dem Pre-Insert. Die Rate-Limit-
        // Entscheidung haben wir oben (willCompare) bereits getroffen;
        // evaluatePin läuft dann nur noch den no_pin/mismatch-Pfad.
        recentFailuresInWindow: count ?? 0,
        compare: (pin, hash) => bcrypt.compare(pin, hash),
      });

      if (outcome.kind === "ok") {
        matches.push({ id: cand.id, organization_id: cand.organization_id });
        // Erfolg → spekulative Fail-Zeile wieder entfernen.
        if (preId) {
          await supabaseAdmin.from("pin_attempts").delete().eq("id", preId);
        }
      }
      // outcome=rejected → Zeile bleibt stehen (das ist der Fehlversuch).
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
