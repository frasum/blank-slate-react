// KI1 — Server-Fn "askCoco": admin-only. Führt die Tool-Use-Schleife gegen
// Anthropic. Pseudonymisiert Personendaten vor jedem API-Aufruf und dreht
// die Ersetzung in der finalen Antwort zurück — das Modell sieht nie einen
// Klarnamen, der Nutzer nie einen Platzhalter.
//
// Zusätzlich: `getKiUsageMonth` liefert die Monats-Summe für die Fußzeile
// der Chat-Seite.
//
// Datenschutzhinweis: staff_personal_details / lohn_* werden NICHT gelesen.
// Nur staff (id + display_name für die Namensersetzung) und die vom Tool
// benötigten Aggregat-Tabellen.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import {
  buildPseudonymMap,
  depseudonymize,
  pseudonymize,
  pseudonymizeDeep,
  type StaffPseudonymInput,
} from "./pseudonym";
import {
  callModel,
  ModelUnavailableError,
  type ContentBlock,
  type Message,
} from "./anthropic-client";
import { TOOL_NAMES, TOOLS, type ToolName } from "./tools";
import { runTool, ToolError, type ToolContext } from "./tool-dispatcher.server";
import { costMicroCents } from "./cost";
import { computePresets } from "./period-resolver";

const MAX_ROUNDS = 6;

const HistoryMessage = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string(),
});

const AskInput = z.object({
  question: z.string().min(1).max(4000),
  history: z.array(HistoryMessage).max(20).optional().default([]),
});

export type AskCocoResult =
  | {
      ok: true;
      answer: string;
      toolsUsed: ToolName[];
      rounds: number;
      usage: { inputTokens: number; outputTokens: number };
      model: string;
    }
  | {
      ok: false;
      /** Freundliche Meldung — z. B. Modell nicht eingerichtet, Rundenlimit erreicht. */
      notice: string;
    };

function systemPrompt(now: Date, locations: readonly { id: string; name: string }[]): string {
  const heute = now.toISOString().slice(0, 10);
  const presets = computePresets(now)
    .map((p) => `  - ${p.key}: ${p.from} bis ${p.to} (${p.label})`)
    .join("\n");
  const locList = locations.map((l) => `  - ${l.name} (id: ${l.id})`).join("\n");
  return [
    "Du bist COCO — Betriebsassistent für Franks Restaurants (Spicery, Yum & Co.).",
    "Antworte kurz, sachlich, auf Deutsch. Duze den Nutzer.",
    "",
    "REGELN (nicht verhandelbar):",
    "1. Rechne NIE selbst. Zahlen und Fakten stammen ausschließlich aus Tool-Ergebnissen.",
    "2. Wenn keins der Tools zur Frage passt, sag ehrlich, dass die Frage außerhalb deines Werkzeugkastens liegt und welche Auswertung (Menüpunkt in COCO) stattdessen helfen würde.",
    "3. Geldbeträge kommen aus den Tools als Euro-Zahlen — formatiere sie mit Punkt als Tausender-Trennzeichen und Komma als Dezimalzeichen (deutsches Format).",
    '4. Nenne im Antworttext immer den Zeitraum, auf den sich die Zahlen beziehen (z. B. "01.–30.06.2026").',
    "5. Personendaten sind pseudonymisiert (MA-1, MA-2 …). Verwende die Codes wörtlich in deiner Antwort — die Anwendung übersetzt sie beim Anzeigen zurück in Klarnamen.",
    "6. Bei Getränken (Werkzeug getraenke_ranking) gibt es nur die Snapshots 'd365' (letzte 365 Tage) und 'alltime'. Fragt der Nutzer nach einem beliebigen Zeitraum, wähle den passendsten Snapshot und weise darauf hin.",
    "",
    `Heute ist ${heute}. Verwende diese Zeitraum-Presets, wenn der Nutzer 'letzter Monat', 'diese Woche' o. ä. sagt:`,
    presets,
    "",
    "Bekannte Standorte:",
    locList,
  ].join("\n");
}

export const askCoco = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => AskInput.parse(input))
  .handler(async ({ data, context }): Promise<AskCocoResult> => {
    // admin-only (Werkzeuge sehen aggregierte Personaldaten).
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Pseudonym-Map aus Staff-Liste bauen.
    const { data: staffRows, error: staffErr } = await supabaseAdmin
      .from("staff")
      .select("id, display_name, first_name, last_name")
      .eq("organization_id", caller.organizationId);
    if (staffErr) throw new Error(staffErr.message);
    const map = buildPseudonymMap(
      (staffRows ?? []).map<StaffPseudonymInput>((s) => ({
        id: s.id as string,
        displayName: (s.display_name as string | null) ?? null,
        firstName: (s.first_name as string | null) ?? null,
        lastName: (s.last_name as string | null) ?? null,
      })),
    );

    const { data: locs, error: locErr } = await supabaseAdmin
      .from("locations")
      .select("id, name")
      .eq("organization_id", caller.organizationId)
      .order("name");
    if (locErr) throw new Error(locErr.message);

    // Konversationsverlauf → Anthropic-Format. Client-History pseudonymisieren.
    const messages: Message[] = [];
    for (const h of data.history) {
      messages.push({ role: h.role, content: pseudonymize(h.text, map) });
    }
    messages.push({ role: "user", content: pseudonymize(data.question, map) });

    const toolCtx: ToolContext = {
      admin: supabaseAdmin,
      organizationId: caller.organizationId,
      pseudonym: map,
    };

    const toolsUsed = new Set<ToolName>();
    let totalInput = 0;
    let totalOutput = 0;
    let modelName = process.env.COCO_KI_MODEL ?? "claude-haiku-4-5";

    try {
      let round = 0;
      while (round < MAX_ROUNDS) {
        round += 1;
        const res = await callModel({
          system: systemPrompt(new Date(), locs ?? []),
          messages,
          tools: TOOLS,
          maxTokens: 1024,
        });
        totalInput += res.usage.inputTokens;
        totalOutput += res.usage.outputTokens;
        modelName = res.model;

        // Assistant-Antwort in den Verlauf aufnehmen (unverändert, inkl. tool_use).
        messages.push({ role: "assistant", content: res.content });

        if (res.stopReason !== "tool_use") {
          // Finale Antwort — Text-Blöcke joinen, MA-Codes zurückübersetzen.
          const finalText = extractText(res.content);
          const answer = depseudonymize(finalText, map);
          await logUsage(supabaseAdmin, {
            organizationId: caller.organizationId,
            staffId: caller.staffId,
            model: modelName,
            inputTokens: totalInput,
            outputTokens: totalOutput,
            toolRounds: round,
          });
          return {
            ok: true,
            answer,
            toolsUsed: [...toolsUsed],
            rounds: round,
            usage: { inputTokens: totalInput, outputTokens: totalOutput },
            model: modelName,
          };
        }

        // tool_use-Blöcke ausführen und tool_result-Blöcke zurückschicken.
        const toolBlocks = res.content.filter(
          (c): c is Extract<ContentBlock, { type: "tool_use" }> => c.type === "tool_use",
        );
        const results: ContentBlock[] = [];
        for (const tu of toolBlocks) {
          const name = tu.name as ToolName;
          if (!(TOOL_NAMES as readonly string[]).includes(name)) {
            results.push({
              type: "tool_result",
              tool_use_id: tu.id,
              content: `Unbekanntes Werkzeug: ${tu.name}`,
              is_error: true,
            });
            continue;
          }
          toolsUsed.add(name);
          try {
            const raw = await runTool(toolCtx, name, tu.input ?? {});
            // Ergebnis noch einmal deep-pseudonymisieren (Guard-Rail — falls ein
            // Tool das vergessen sollte).
            const safe = pseudonymizeDeep(raw, map);
            results.push({
              type: "tool_result",
              tool_use_id: tu.id,
              content: JSON.stringify(safe),
            });
          } catch (err) {
            const msg =
              err instanceof ToolError
                ? err.message
                : err instanceof Error
                  ? err.message
                  : "Unbekannter Fehler.";
            results.push({
              type: "tool_result",
              tool_use_id: tu.id,
              content: msg,
              is_error: true,
            });
          }
        }
        messages.push({ role: "user", content: results });
      }

      await logUsage(supabaseAdmin, {
        organizationId: caller.organizationId,
        staffId: caller.staffId,
        model: modelName,
        inputTokens: totalInput,
        outputTokens: totalOutput,
        toolRounds: round,
      });
      return {
        ok: false,
        notice:
          "Die Anfrage war zu vielschichtig — COCO hat nach 6 Werkzeug-Runden abgebrochen. Bitte zerlege die Frage in kleinere Schritte.",
      };
    } catch (err) {
      if (err instanceof ModelUnavailableError) {
        return { ok: false, notice: err.message };
      }
      throw err;
    }
  });

function extractText(blocks: ContentBlock[]): string {
  return blocks
    .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

// Typ des Admin-Clients (server-only). Import erfolgt nur zur Typprüfung —
// deshalb `import type`, damit der Runtime-Import im Handler ausreicht.
import type { supabaseAdmin as SupabaseAdminType } from "@/integrations/supabase/client.server";

async function logUsage(
  admin: typeof SupabaseAdminType,
  entry: {
    organizationId: string;
    staffId: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    toolRounds: number;
  },
): Promise<void> {
  const cost = costMicroCents(entry.model, entry.inputTokens, entry.outputTokens);
  const { error } = await admin.from("ki_usage_log").insert({
    organization_id: entry.organizationId,
    staff_id: entry.staffId,
    model: entry.model,
    input_tokens: entry.inputTokens,
    output_tokens: entry.outputTokens,
    tool_rounds: entry.toolRounds,
    cost_microcents: cost,
  });
  if (error) {
    // Kostenprotokoll darf die Nutzerantwort nicht kaputt machen.
    console.error("ki_usage_log insert failed:", error.message);
  }
}

// ────────────────────────────────────────────────────────── Nutzung/Monat ──

export type KiUsageMonth = {
  yearMonth: string; // YYYY-MM
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costMicroCents: number;
};

export const getKiUsageMonth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        yearMonth: z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<KiUsageMonth> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date();
    const ym =
      data.yearMonth ?? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const [y, m] = ym.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1)).toISOString();
    const end = new Date(Date.UTC(y, m, 1)).toISOString();

    const { data: rows, error } = await supabaseAdmin
      .from("ki_usage_log")
      .select("input_tokens, output_tokens, cost_microcents")
      .eq("organization_id", caller.organizationId)
      .gte("created_at", start)
      .lt("created_at", end);
    if (error) throw new Error(error.message);

    let requests = 0;
    let input = 0;
    let output = 0;
    let cost = 0;
    for (const r of rows ?? []) {
      requests += 1;
      input += Number(r.input_tokens ?? 0);
      output += Number(r.output_tokens ?? 0);
      cost += Number(r.cost_microcents ?? 0);
    }
    return {
      yearMonth: ym,
      requests,
      inputTokens: input,
      outputTokens: output,
      costMicroCents: cost,
    };
  });
