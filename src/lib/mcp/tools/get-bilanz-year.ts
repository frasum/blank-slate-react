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
    "Liest den Jahresabschluss (Aktiva, Passiva, GuV mit Positionen und Kontennachweis) für eine Organisation, eine Entity (z. B. 'YUM Gastronomie GmbH') und ein Geschäftsjahr. Beträge werden in Euro zurückgegeben.",
  inputSchema: {
    organizationId: z
      .string()
      .uuid()
      .describe("UUID der Organisation (public.organizations.id)."),
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
  handler: async ({ organizationId, entity, fiscalYear }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [posQ, kontenQ] = await Promise.all([
      supabaseAdmin
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("bilanz_positions" as any)
        .select(
          "statement, code, parent_code, label, level, sort_order, betrag_cents, vorjahr_cents, source",
        )
        .eq("organization_id", organizationId)
        .eq("entity", entity)
        .eq("fiscal_year", fiscalYear)
        .order("sort_order", { ascending: true }),
      supabaseAdmin
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("bilanz_konten" as any)
        .select(
          "statement, position_code, konto_nr, label, betrag_cents, vorjahr_cents, sort_order",
        )
        .eq("organization_id", organizationId)
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