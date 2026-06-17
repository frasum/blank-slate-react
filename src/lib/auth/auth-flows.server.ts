import { z } from "zod";

const FAILED_MESSAGE = "Anmeldung fehlgeschlagen";

export function failed(): never {
  throw new Error(FAILED_MESSAGE);
}

export function parsePinLoginInput(input: unknown) {
  return z
    .object({
      firstName: z.string().trim().min(1).max(64),
      pin: z.string().min(1).max(32),
    })
    .parse(input);
}

export function parseBadgeLoginInput(input: unknown) {
  return z.object({ token: z.string().min(1).max(256) }).parse(input);
}

export function toPostgrestIlikeLiteral(value: string): string {
  return value.replace(/[(),.\\]/g, "");
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