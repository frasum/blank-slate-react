// KI-Recherche für Wein-Stammdaten (Welle 3-A, Aufsatz).
// Ablauf: (1) Firecrawl-Web-Search mit Namen (+ optional Winzer/Herkunft) →
// (2) Lovable AI Gateway (Gemini) extrahiert daraus Rebsorte, Herkunft,
// Speisenempfehlungen, Beschreibung, Merkmale. Server-only, Manager+.
//
// Bewusst KEIN Schreibzugriff auf `articles`: der Aufrufer bekommt einen
// Vorschlag zurück, der UI-seitig ins Formular vorbelegt wird und vom
// Menschen geprüft und gespeichert werden muss. Ehrlichkeitsregel: Modell
// kann irren.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";

const SPECIAL_ATTRS = ["Bio", "Vegan", "Biodynamisch", "Demeter", "Alte Reben"] as const;

export type WineResearchSuggestion = {
  grapeVariety: string;
  originCountry: string;
  foodPairings: string;
  description: string;
  specialAttributes: string[];
  sources: string[];
};

type FirecrawlSearchResult = {
  success?: boolean;
  data?: {
    web?: Array<{ url?: string; title?: string; description?: string; markdown?: string }>;
  };
};

type GeminiChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

async function firecrawlSearch(query: string): Promise<
  Array<{ url: string; title: string; markdown: string }>
> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("Firecrawl-Connector ist nicht verbunden.");
  const response = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      limit: 4,
      scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Firecrawl-Suche fehlgeschlagen (${response.status}): ${body.slice(0, 200)}`);
  }
  const data = (await response.json()) as FirecrawlSearchResult;
  const web = data.data?.web ?? [];
  return web
    .filter((r): r is { url: string; title: string; markdown: string } =>
      Boolean(r.url && r.markdown && r.markdown.trim().length > 0),
    )
    .map((r) => ({
      url: r.url,
      title: r.title ?? r.url,
      markdown: r.markdown.slice(0, 4000),
    }));
}

async function extractWithGemini(
  wineName: string,
  hints: string,
  sources: Array<{ url: string; title: string; markdown: string }>,
): Promise<WineResearchSuggestion> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) throw new Error("LOVABLE_API_KEY fehlt.");

  const sourceBlock = sources
    .map((s, i) => `[Quelle ${i + 1}] ${s.title}\nURL: ${s.url}\n---\n${s.markdown}`)
    .join("\n\n===\n\n");

  const system = [
    "Du bist Sommelier-Assistent. Extrahiere aus den Quellen faktisch belegte",
    "Angaben zum genannten Wein. Antworte AUSSCHLIESSLICH als JSON-Objekt mit",
    "genau diesen Feldern:",
    '{"grapeVariety": string, "originCountry": string,',
    ' "foodPairings": string, "description": string, "specialAttributes": string[]}',
    "",
    "Regeln:",
    "- Alle Textfelder auf Deutsch, prägnant.",
    "- grapeVariety: eine oder mehrere Rebsorten, kommagetrennt. Leer wenn unklar.",
    "- originCountry: nur das Land (z. B. 'Spanien'), nicht die Region.",
    "- foodPairings: 3–6 Speisen kommagetrennt (z. B. 'Meeresfrüchte, Fisch, Ziegenkäse').",
    "- description: 1–2 Sätze über Charakter, Ausbau, Aromatik. Keine Marketing-Floskeln.",
    `- specialAttributes: nur aus dieser festen Liste, was belegt ist: ${SPECIAL_ATTRS.join(", ")}. Leeres Array wenn nichts belegt.`,
    "- KEINE Halluzination: wenn ein Feld nicht in den Quellen steht, leerer String bzw. leeres Array.",
    "- KEINE Quellenangaben im Text, KEIN Markdown, nur reines JSON.",
  ].join("\n");

  const user = [
    `Wein: ${wineName}`,
    hints ? `Hinweise: ${hints}` : "",
    "",
    "Quellen:",
    sourceBlock || "(keine)",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Lovable-API-Key": lovableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    if (response.status === 429) throw new Error("KI-Ratelimit erreicht — bitte kurz warten.");
    if (response.status === 402) throw new Error("KI-Guthaben aufgebraucht.");
    throw new Error(`KI-Aufruf fehlgeschlagen (${response.status}): ${body.slice(0, 200)}`);
  }
  const data = (await response.json()) as GeminiChatResponse;
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error("KI lieferte keine Antwort.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("KI-Antwort war kein gültiges JSON.");
  }

  const asObj = (parsed ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const attrsRaw = Array.isArray(asObj.specialAttributes) ? asObj.specialAttributes : [];
  const attrs = attrsRaw
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v): v is (typeof SPECIAL_ATTRS)[number] =>
      (SPECIAL_ATTRS as readonly string[]).includes(v),
    );

  return {
    grapeVariety: str(asObj.grapeVariety),
    originCountry: str(asObj.originCountry),
    foodPairings: str(asObj.foodPairings),
    description: str(asObj.description),
    specialAttributes: attrs,
    sources: sources.map((s) => s.url),
  };
}

export const researchWine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().trim().min(2).max(200),
        hints: z.string().trim().max(300).optional().default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<WineResearchSuggestion> => {
    // Manager+ — dieselbe Schwelle wie Artikelpflege.
    await loadAdminCaller(context.supabase, context.userId, "manager");
    return runResearchPipeline(data.name, data.hints);
  });

async function runResearchPipeline(name: string, hints: string): Promise<WineResearchSuggestion> {
  const query = `${name} Wein Rebsorte Herkunft ${hints}`.trim();
  const sources = await firecrawlSearch(query);
  if (sources.length === 0) {
    throw new Error("Keine belastbaren Web-Treffer gefunden. Namen präzisieren?");
  }
  return extractWithGemini(name, hints, sources);
}

// Welle 3-B — Batch-Recherche. Lädt Artikel selbst, gibt aktuelle Werte +
// Vorschlag zurück (Diff-Ansicht im UI). Fehler wird als Feld zurückgegeben,
// damit die Batch-Schleife weiterläuft — nie throw hier, außer bei
// Auth/Owner-Fehlern.
export type WineCurrentValues = {
  grapeVariety: string;
  originCountry: string;
  foodPairings: string;
  description: string;
  specialAttributes: string[];
};

export type WineResearchBatchItem = {
  articleId: string;
  name: string;
  current: WineCurrentValues;
  suggestion: WineResearchSuggestion | null;
  error: string | null;
};

export const researchWineById = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ articleId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<WineResearchBatchItem> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("articles")
      .select(
        "id, name, description, grape_variety, origin_country, food_pairings, special_attributes",
      )
      .eq("id", data.articleId)
      .eq("organization_id", caller.organizationId)
      .eq("category", "Wein")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Wein nicht gefunden.");
    const current: WineCurrentValues = {
      grapeVariety: row.grape_variety ?? "",
      originCountry: row.origin_country ?? "",
      foodPairings: row.food_pairings ?? "",
      description: row.description ?? "",
      specialAttributes: Array.isArray(row.special_attributes)
        ? (row.special_attributes as string[])
        : [],
    };
    const hints = [current.originCountry, current.grapeVariety].filter((s) => s.trim()).join(" ");
    try {
      const suggestion = await runResearchPipeline(row.name, hints);
      return { articleId: row.id, name: row.name, current, suggestion, error: null };
    } catch (e) {
      return {
        articleId: row.id,
        name: row.name,
        current,
        suggestion: null,
        error: e instanceof Error ? e.message : "Recherche fehlgeschlagen.",
      };
    }
  });