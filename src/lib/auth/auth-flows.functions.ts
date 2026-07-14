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
import { evaluatePin, PIN_RATE_LIMIT_MAX, PIN_RATE_LIMIT_WINDOW_MS } from "./pin-validation";
import { captureServerError } from "@/lib/monitoring/sentry.server";
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

// §95 — 42501-Vorfall: fehlender GRANT EXECUTE auf pin_attempt_register hat
// den Login stumm auf 42501 laufen lassen. Damit so ein Regressions-Fehler
// nie wieder unbemerkt bleibt, forwarden wir genau diesen Fall mit
// eindeutigen Tags an Sentry — die Alerting-Regel filtert daraufhin
// (siehe docs/sentry-alert-42501.md).
function reportPinRpcPrivilegeError(
  op: "pin-login" | "password-login",
  err: { code?: string | null; message?: string } | null | undefined,
): void {
  if (!err || err.code !== "42501") return;
  void captureServerError(new Error(`[${op}] pin_attempt_register 42501: ${err.message ?? ""}`), {
    op,
    critical: true,
    tags: {
      alert: "pin_rpc_privilege",
      rpc: "pin_attempt_register",
      pg_code: "42501",
    },
  });
}

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
      // N3: Zählen + Insert atomar via pin_attempt_register (Advisory-Lock
      // je staff_id). attempt_id === null → Limit erreicht, Kandidat
      // überspringen. Bei Erfolg wird die spekulative Zeile wieder
      // entfernt (Erfolg zählt nicht als Fehler).
      const sessions: { access_token: string; refresh_token: string }[] = [];
      for (const cand of candidates) {
        const { data: reg, error: regErr } = await supabaseAdmin.rpc("pin_attempt_register", {
          p_organization_id: cand.organization_id,
          p_staff_id: cand.id,
          // p_ip ist SQL-seitig nullable (behandelt NULL explizit), die
          // generierte Signatur ist aber string. Cast auf unknown hält
          // die Typprüfung ruhig, ohne die Laufzeit-Semantik zu ändern.
          p_ip: clientIp as unknown as string,
          p_window_ms: PIN_RATE_LIMIT_WINDOW_MS,
          p_staff_max: PIN_RATE_LIMIT_MAX,
          p_ip_max: PIN_IP_RATE_LIMIT_MAX,
        });
        if (regErr) {
          console.error("[password-login] pin_attempt_register error:", regErr);
          reportPinRpcPrivilegeError("password-login", regErr);
          continue;
        }
        const row = Array.isArray(reg) ? reg[0] : reg;
        const attemptId = row?.attempt_id ?? null;
        if (!attemptId) continue;

        const session = await tryStaffPasswordLogin(cand.id, data.pin);
        if (session) {
          sessions.push(session);
          await supabaseAdmin.from("pin_attempts").delete().eq("id", attemptId);
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

      // N3: Zählen + Insert atomar (Advisory-Lock je staff_id). Nur
      // registrieren, wenn wir überhaupt vergleichen — also Hash vorhanden.
      let attemptId: string | null = null;
      let staffFailures = 0;
      if (pinRow?.pin_hash) {
        const { data: reg, error: regErr } = await supabaseAdmin.rpc("pin_attempt_register", {
          p_organization_id: cand.organization_id,
          p_staff_id: cand.id,
          p_ip: clientIp as unknown as string,
          p_window_ms: PIN_RATE_LIMIT_WINDOW_MS,
          p_staff_max: PIN_RATE_LIMIT_MAX,
          p_ip_max: PIN_IP_RATE_LIMIT_MAX,
        });
        if (regErr) {
          console.error("[pin-login] pin_attempt_register error:", regErr);
          reportPinRpcPrivilegeError("pin-login", regErr);
          continue;
        }
        const row = Array.isArray(reg) ? reg[0] : reg;
        attemptId = row?.attempt_id ?? null;
        staffFailures = row?.staff_failures ?? 0;
        // attemptId === null → Limit erreicht; evaluatePin unten liefert
        // dann rate_limited (Zähler >= MAX) — Semantik unverändert.
      }

      const outcome = await evaluatePin({
        storedHash: pinRow?.pin_hash ?? null,
        providedPin: data.pin,
        // Zähler VOR dem eigenen Insert (aus dem RPC). Erreicht das Limit
        // die Schwelle, liefert evaluatePin rate_limited — identisch zur
        // vorherigen Übergabe.
        recentFailuresInWindow: attemptId ? staffFailures : PIN_RATE_LIMIT_MAX,
        compare: (pin, hash) => bcrypt.compare(pin, hash),
      });

      if (outcome.kind === "ok") {
        matches.push({ id: cand.id, organization_id: cand.organization_id });
        if (attemptId) {
          await supabaseAdmin.from("pin_attempts").delete().eq("id", attemptId);
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
