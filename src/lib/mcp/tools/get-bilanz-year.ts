import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

type Statement = "aktiva" | "passiva" | "guv";

type PositionRow = {
  statement: Statement;
  code: string;
  parent_code: string | null;
  label: string;
  level: number;
  sort_order: number;
  betrag_cents: number;
  vorjahr_cents: number | null;
  source: "pdf" | "manual";
};

type KontoRow = {
  statement: Statement;
  position_code: string;
  konto_nr: string;
  label: string;
  betrag_cents: number;
  vorjahr_cents: number | null;
  sort_order: number;
};

function centsToEuro(c: number | null): number | null {
  if (c === null) return null;
  return Math.round(c) / 100;
}

export default defineTool({
  name: "get_bilanz_year",
  title: "Bilanzdaten für ein Jahr abrufen",
  description:
    "Liest den Jahresabschluss (Aktiva, Passiva, GuV mit Positionen und Kontennachweis) für eine Entity (z. B. 'YUM Gastronomie GmbH') und ein Geschäftsjahr. Scope wird aus der Session des Aufrufers abgeleitet — nur Daten der eigenen Organisation, admin-only. Beträge werden in Euro zurückgegeben.",
  inputSchema: {
    entity: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .describe("Entity-Bezeichnung, z. B. 'YUM Gastronomie GmbH'."),
    fiscalYear: z
      .number()
      .int()
      .min(2000)
      .max(2100)
      .describe("Geschäftsjahr (vierstellig, z. B. 2024)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ entity, fiscalYear }, ctx) => {
    // Auth-Gate: nur OAuth-Clients mit Supabase-User-Token.
    if (!ctx.isAuthenticated()) {
      return {
        content: [{ type: "text", text: "Nicht authentifiziert." }],
        isError: true,
      };
    }
    const userId = ctx.getUserId();
    const token = ctx.getToken();
    if (!userId || !token) {
      return {
        content: [{ type: "text", text: "Kein gültiges Access-Token." }],
        isError: true,
      };
    }

    // User-scoped Supabase-Client (RLS greift als angemeldeter Nutzer).
    const { createClient } = await import("@supabase/supabase-js");
    const { loadAdminCaller } = await import("@/lib/admin/admin-context");
    const { ForbiddenError } = await import("@/lib/admin/role-guard");

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      return {
        content: [{ type: "text", text: "Supabase-Konfiguration fehlt (URL/Key)." }],
        isError: true,
      };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    // Admin-Gate + Org-Scope aus user_links + role_assignments.
    let caller;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      caller = await loadAdminCaller(supabase as any, userId, ["admin"]);
    } catch (err) {
      if (err instanceof ForbiddenError) {
        return {
          content: [{ type: "text", text: "Zugriff verweigert (nur Admin)." }],
          isError: true,
        };
      }
      throw err;
    }

    // Bilanz-Tabellen: RLS erlaubt admin-Lesen im eigenen Org-Scope;
    // .eq("organization_id", caller.organizationId) macht den Scope
    // zusätzlich explizit (Defense-in-Depth, falls RLS-Policy geweitet wird).
    const [posQ, kontenQ] = await Promise.all([
      supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("bilanz_positions" as any)
        .select(
          "statement, code, parent_code, label, level, sort_order, betrag_cents, vorjahr_cents, source",
        )
        .eq("organization_id", caller.organizationId)
        .eq("entity", entity)
        .eq("fiscal_year", fiscalYear)
        .order("sort_order", { ascending: true }),
      supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("bilanz_konten" as any)
        .select(
          "statement, position_code, konto_nr, label, betrag_cents, vorjahr_cents, sort_order",
        )
        .eq("organization_id", caller.organizationId)
        .eq("entity", entity)
        .eq("fiscal_year", fiscalYear)
        .order("sort_order", { ascending: true }),
    ]);

    if (posQ.error) {
      return {
        content: [{ type: "text", text: `Fehler (positions): ${posQ.error.message}` }],
        isError: true,
      };
    }
    if (kontenQ.error) {
      return {
        content: [{ type: "text", text: `Fehler (konten): ${kontenQ.error.message}` }],
        isError: true,
      };
    }

    const positions = ((posQ.data ?? []) as unknown as PositionRow[]).map((p) => ({
      statement: p.statement,
      code: p.code,
      parentCode: p.parent_code,
      label: p.label,
      level: p.level,
      sortOrder: p.sort_order,
      betragEuro: centsToEuro(p.betrag_cents),
      vorjahrEuro: centsToEuro(p.vorjahr_cents),
      source: p.source,
    }));
    const konten = ((kontenQ.data ?? []) as unknown as KontoRow[]).map((k) => ({
      statement: k.statement,
      positionCode: k.position_code,
      kontoNr: k.konto_nr,
      label: k.label,
      betragEuro: centsToEuro(k.betrag_cents),
      vorjahrEuro: centsToEuro(k.vorjahr_cents),
      sortOrder: k.sort_order,
    }));

    if (positions.length === 0 && konten.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `Keine Bilanzdaten gefunden für entity="${entity}", fiscalYear=${fiscalYear}.`,
          },
        ],
        structuredContent: { entity, fiscalYear, positions: [], konten: [] },
      };
    }

    const topSum = (stmt: Statement) =>
      positions
        .filter((p) => p.statement === stmt && p.level === 0 && p.betragEuro !== null)
        .reduce((a, p) => a + (p.betragEuro ?? 0), 0);

    const summary = {
      entity,
      fiscalYear,
      bilanzsummeAktivaEuro: topSum("aktiva"),
      bilanzsummePassivaEuro: topSum("passiva"),
      positionCount: positions.length,
      kontoCount: konten.length,
    };

    return {
      content: [
        {
          type: "text",
          text:
            `Jahresabschluss ${entity} ${fiscalYear}: ` +
            `${positions.length} Positionen, ${konten.length} Konten. ` +
            `Bilanzsumme Aktiva=${summary.bilanzsummeAktivaEuro.toFixed(2)} €, ` +
            `Passiva=${summary.bilanzsummePassivaEuro.toFixed(2)} €.`,
        },
      ],
      structuredContent: { summary, positions, konten },
    };
  },
});
