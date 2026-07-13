// Produktions-Config-Check: meldet nur *Präsenz* und Format-Hinweise von
// server-seitigen Umgebungsvariablen (Werte werden NIE zurückgegeben).
// Admin-only via loadAdminCaller. Wird von /admin/config-check gerendert.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "./admin-context";

export type ConfigVarStatus = {
  name: string;
  present: boolean;
  hint: string | null; // z. B. „URL sieht ok aus", „Länge 219" — nie der Wert
  critical: boolean; // fehlt → App/Feature funktioniert nicht
  group: "supabase" | "mail" | "ai" | "cron" | "monitoring" | "sonstiges";
  purpose: string;
};

export type ConfigCheckResult = {
  checkedAt: string;
  vars: ConfigVarStatus[];
  summary: {
    total: number;
    present: number;
    missing: number;
    missingCritical: string[];
  };
};

type Spec = Omit<ConfigVarStatus, "present" | "hint">;

const SPECS: Spec[] = [
  // Supabase — server-seitig
  {
    name: "SUPABASE_URL",
    critical: true,
    group: "supabase",
    purpose: "Server-seitige Supabase-Basis-URL für alle server functions.",
  },
  {
    name: "SUPABASE_PUBLISHABLE_KEY",
    critical: true,
    group: "supabase",
    purpose: "Publishable-Key für user-scoped server functions (RLS aktiv).",
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    critical: true,
    group: "supabase",
    purpose: "Service-Role-Key für supabaseAdmin (RLS-Bypass, nur Server).",
  },
  {
    name: "SUPABASE_DB_URL",
    critical: false,
    group: "supabase",
    purpose: "Direktverbindung zur DB (z. B. Wartungsjobs).",
  },
  // Mail
  {
    name: "MAILERSEND_API_KEY",
    critical: true,
    group: "mail",
    purpose: "Versand von Bestell- und System-Mails via MailerSend.",
  },
  {
    name: "MAILERSEND_FROM_EMAIL",
    critical: true,
    group: "mail",
    purpose: "Absenderadresse für alle Mails.",
  },
  {
    name: "MAILERSEND_FROM_NAME",
    critical: false,
    group: "mail",
    purpose: "Absender-Anzeigename (Fallback: „Bestellung COCO").",
  },
  // KI
  {
    name: "LOVABLE_API_KEY",
    critical: false,
    group: "ai",
    purpose: "Lovable AI Gateway (Frag COCO Fallback / Embeddings).",
  },
  {
    name: "ANTHROPIC_API_KEY",
    critical: false,
    group: "ai",
    purpose: "Claude (Frag COCO Hauptmodell).",
  },
  // Cron / Public API
  {
    name: "CRON_SECRET",
    critical: false,
    group: "cron",
    purpose: "Header-Secret für /api/public/* Cron-Endpunkte.",
  },
  {
    name: "TELEGRAM_CRON_SECRET",
    critical: false,
    group: "cron",
    purpose: "Header-Secret für den Telegram-Tagesbericht-Cron.",
  },
  {
    name: "TELEGRAM_API_KEY",
    critical: false,
    group: "cron",
    purpose: "Telegram-Bot-Token für Tages-/System-Nachrichten.",
  },
  // Monitoring
  {
    name: "SENTRY_DSN",
    critical: false,
    group: "monitoring",
    purpose: "Sentry-Fehler-Reporting (Backend/SSR).",
  },
  // GoCardless (BK2, aktuell vertagt — bewusst optional)
  {
    name: "GOCARDLESS_BAD_SECRET_ID",
    critical: false,
    group: "sonstiges",
    purpose: "GoCardless-BAD Zugangsdaten (Bank-Sync, BK2 — noch inaktiv).",
  },
  {
    name: "GOCARDLESS_BAD_SECRET_KEY",
    critical: false,
    group: "sonstiges",
    purpose: "GoCardless-BAD Zugangsdaten (Bank-Sync, BK2 — noch inaktiv).",
  },
];

function hintFor(name: string, raw: string | undefined): string | null {
  if (!raw) return null;
  const len = raw.length;
  if (name === "SUPABASE_URL" || name === "SUPABASE_DB_URL") {
    try {
      const u = new URL(raw);
      return `Host ${u.host}`;
    } catch {
      return "Kein gültiges URL-Format";
    }
  }
  if (name === "MAILERSEND_FROM_EMAIL") {
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw) ? "Format ok" : "Kein E-Mail-Format";
  }
  if (name === "MAILERSEND_FROM_NAME") {
    return `Länge ${len}`;
  }
  // Keys/Tokens: nur Länge zurückgeben, niemals Wertteile.
  return `Länge ${len}`;
}

export const getProductionConfigStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ConfigCheckResult> => {
    // Admin-only — Config-Namen und Anwesenheit sind sensibel genug.
    await loadAdminCaller(context.supabase, context.userId, "admin");

    const vars: ConfigVarStatus[] = SPECS.map((spec) => {
      const raw = process.env[spec.name];
      const present = typeof raw === "string" && raw.length > 0;
      return {
        ...spec,
        present,
        hint: present ? hintFor(spec.name, raw) : null,
      };
    });

    const missing = vars.filter((v) => !v.present);
    return {
      checkedAt: new Date().toISOString(),
      vars,
      summary: {
        total: vars.length,
        present: vars.length - missing.length,
        missing: missing.length,
        missingCritical: missing.filter((v) => v.critical).map((v) => v.name),
      },
    };
  });