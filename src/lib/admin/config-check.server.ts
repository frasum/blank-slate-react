// Server-only: liest Server-Env-Variablen und liefert nur Präsenz-Status
// plus formale Hinweise (Länge, URL-Host, E-Mail-Format) — NIE Werte oder
// Wert-Fragmente. Wird ausschließlich aus config-check.functions.ts
// aufgerufen; das Service-Role-Geheimnis darf laut Hauskonvention nur in
// *.server.ts-Modulen genannt werden.

export type ConfigVarGroup = "supabase" | "mail" | "ai" | "cron" | "monitoring" | "sonstiges";

export type ConfigVarStatus = {
  name: string;
  present: boolean;
  hint: string | null;
  critical: boolean;
  group: ConfigVarGroup;
  purpose: string;
};

type Spec = Omit<ConfigVarStatus, "present" | "hint">;

const SPECS: Spec[] = [
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
    purpose: 'Absender-Anzeigename (Fallback: „Bestellung COCO“).',
  },
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
  {
    name: "SENTRY_DSN",
    critical: false,
    group: "monitoring",
    purpose: "Sentry-Fehler-Reporting (Backend/SSR).",
  },
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

function hintFor(name: string, raw: string): string | null {
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

export function collectConfigStatus(): ConfigVarStatus[] {
  return SPECS.map((spec) => {
    const raw = process.env[spec.name];
    const present = typeof raw === "string" && raw.length > 0;
    return {
      ...spec,
      present,
      hint: present ? hintFor(spec.name, raw as string) : null,
    };
  });
}