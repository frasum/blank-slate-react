import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

const FAILED_MESSAGE = "Anmeldung fehlgeschlagen";

export function failed(): never {
  throw new Error(FAILED_MESSAGE);
}

export function parsePinLoginInput(input: unknown) {
  return z
    .object({
      firstName: z.string().trim().min(1).max(64),
      pin: z.string().min(1).max(256),
    })
    .parse(input);
}

export function parseNamePasswordLoginInput(input: unknown) {
  return z
    .object({
      firstName: z.string().trim().min(1).max(64),
      password: z.string().min(1).max(256),
    })
    .parse(input);
}

export function parseBadgeLoginInput(input: unknown) {
  return z.object({ token: z.string().min(1).max(256) }).parse(input);
}

/**
 * Allowlist-Validierung für den Namens-Eingabewert im Login.
 * Erlaubt nur Unicode-Buchstaben (inkl. Umlaute/Akzente), Leerzeichen
 * und Bindestriche; muss mit einem Buchstaben beginnen. Damit enthält
 * der Rückgabewert garantiert keine PostgREST-DSL-/Wildcard-Zeichen,
 * sodass die Interpolation in den .or()-Filter sicher ist.
 * Gibt den getrimmten Namen zurück oder null bei Verstoß.
 */
export function validatePinLoginName(value: string): string | null {
  const trimmed = value.trim();
  return /^[\p{L}][\p{L} -]*$/u.test(trimmed) ? trimmed : null;
}

/**
 * Stellt sicher, dass es zu einem staff_id einen auth.users-Eintrag
 * und einen user_links-Eintrag gibt. Liefert die zugehörige E-Mail
 * (für admin.generateLink).
 */
export async function ensureShadowUser(staffId: string, organizationId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: link, error: linkSelectErr } = await supabaseAdmin
    .from("user_links")
    .select("user_id")
    .eq("staff_id", staffId)
    .maybeSingle();
  if (linkSelectErr) console.error("[pin-login] linkSelect error:", linkSelectErr);
  if (linkSelectErr) failed();

  if (link) {
    const { data: existing, error: getErr } = await supabaseAdmin.auth.admin.getUserById(
      link.user_id,
    );
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
  if (createErr || !created.user) console.error("[pin-login] createUser error:", createErr);
  if (createErr || !created.user) failed();

  const { error: insertErr } = await supabaseAdmin.from("user_links").insert({
    user_id: created.user.id,
    staff_id: staffId,
    organization_id: organizationId,
  });
  if (insertErr) console.error("[pin-login] user_links insert error:", insertErr);
  if (insertErr) failed();

  return email;
}

export type PasswordLoginSession = {
  access_token: string;
  refresh_token: string;
};

export async function tryStaffPasswordLogin(
  staffId: string,
  password: string,
): Promise<PasswordLoginSession | null> {
  const { createClient } = await import("@supabase/supabase-js");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: link, error: linkSelectErr } = await supabaseAdmin
    .from("user_links")
    .select("user_id")
    .eq("staff_id", staffId)
    .maybeSingle();
  if (linkSelectErr) console.error("[password-login] linkSelect error:", linkSelectErr);
  if (linkSelectErr || !link) return null;

  const { data: existing, error: getErr } = await supabaseAdmin.auth.admin.getUserById(
    link.user_id,
  );
  if (getErr || !existing.user?.email) {
    console.error("[password-login] getUserById error / keine email:", getErr);
    return null;
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    console.error("[password-login] Supabase public env fehlt.");
    failed();
  }

  const supabasePublic = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabasePublic.auth.signInWithPassword({
    email: existing.user.email,
    password,
  });
  if (error || !data.session) return null;
  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  };
}

/**
 * Erzeugt einen Magic-Link für die Shadow-E-Mail und gibt den hashed_token
 * zurück. Der Client verifiziert ihn mit supabase.auth.verifyOtp.
 */
export async function generateSessionTokenHash(email: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error || !data.properties?.hashed_token)
    console.error("[pin-login] generateLink error:", error);
  if (error || !data.properties?.hashed_token) failed();
  return data.properties.hashed_token;
}
