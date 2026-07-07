// KI1 — Schmale Provider-Abstraktion. Ein einziger Aufruf `callModel(...)`
// spricht die Anthropic Messages API per fetch. Base-URL und Modell kommen
// aus env (`COCO_KI_BASE_URL`, `COCO_KI_MODEL`), damit der spätere Wechsel
// auf einen anderen/EU-/lokalen Endpunkt reine Konfiguration ist — kein
// Code-Umbau.
//
// Läuft ausschließlich serverseitig (Server-Fn / Server-Route). KEIN
// SDK-Package — nur `fetch`, kompatibel mit dem Cloudflare-Worker.

export type MessageRole = "user" | "assistant";

export type ContentBlock =
  | { type: "text"; text: string }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | {
      type: "tool_result";
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    };

export type Message = {
  role: MessageRole;
  content: ContentBlock[] | string;
};

export type ToolDef = {
  name: string;
  description: string;
  // JSON-Schema-fähiger Input-Schema-Body (type: "object", properties, required).
  input_schema: Record<string, unknown>;
};

export type CallModelInput = {
  system: string;
  messages: Message[];
  tools?: ToolDef[];
  maxTokens?: number;
};

export type CallModelResult = {
  /** Anthropic stop_reason: "end_turn" | "tool_use" | "max_tokens" | ... */
  stopReason: string;
  /** Antwortblöcke (text und/oder tool_use). */
  content: ContentBlock[];
  usage: { inputTokens: number; outputTokens: number };
  model: string;
};

export class ModelUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelUnavailableError";
  }
}

/**
 * Einmaliger Aufruf der Messages API. Wirft `ModelUnavailableError`, wenn
 * der API-Key fehlt — der Server-Fn-Wrapper fängt das ab und liefert dem
 * Nutzer einen freundlichen Hinweis (statt Rot).
 */
export async function callModel(input: CallModelInput): Promise<CallModelResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ModelUnavailableError(
      "COCO-KI ist noch nicht eingerichtet: der Anthropic-API-Schlüssel fehlt.",
    );
  }
  const baseUrl = process.env.COCO_KI_BASE_URL ?? "https://api.anthropic.com";
  const model = process.env.COCO_KI_MODEL ?? "claude-haiku-4-5";

  const body: Record<string, unknown> = {
    model,
    max_tokens: input.maxTokens ?? 1024,
    system: input.system,
    messages: input.messages,
  };
  if (input.tools && input.tools.length > 0) body.tools = input.tools;

  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // Kein Key-Fragment loggen — der Provider liefert manchmal echo.
    throw new Error(
      `Anthropic-API antwortete ${res.status}: ${text.slice(0, 400) || res.statusText}`,
    );
  }

  const json = (await res.json()) as {
    stop_reason?: string;
    content?: ContentBlock[];
    usage?: { input_tokens?: number; output_tokens?: number };
    model?: string;
  };

  return {
    stopReason: json.stop_reason ?? "end_turn",
    content: Array.isArray(json.content) ? json.content : [],
    usage: {
      inputTokens: Number(json.usage?.input_tokens ?? 0),
      outputTokens: Number(json.usage?.output_tokens ?? 0),
    },
    model: json.model ?? model,
  };
}
