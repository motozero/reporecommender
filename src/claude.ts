// Native Anthropic Messages API. We call Claude directly (no gateway) so the
// model-tiering and pricing story stays clean. See lessons/10.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export const MODELS = {
  // Cheap and fast: extraction and classification work.
  haiku: "claude-haiku-4-5-20251001",
  // Reasoning: ranking candidates and writing the per-repo rationale.
  sonnet: "claude-sonnet-4-6",
} as const;

export interface ClaudeOpts {
  apiKey: string;
  model: string;
  user: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

export async function callClaude(opts: ClaudeOpts): Promise<string> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.2,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  return (data.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("")
    .trim();
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** Multi-turn variant for the chat-with-a-repo feature. */
export async function callClaudeMessages(opts: {
  apiKey: string;
  model: string;
  system?: string;
  messages: ChatTurn[];
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 800,
      temperature: opts.temperature ?? 0.4,
      system: opts.system,
      messages: opts.messages,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  return (data.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("")
    .trim();
}

/** Pull a JSON value out of a model response, tolerating fences or stray prose. */
export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1]! : text;
  const start = candidate.search(/[[{]/);
  const end = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
  if (start === -1 || end === -1 || end < start) {
    throw new Error("no JSON found in model response");
  }
  return JSON.parse(candidate.slice(start, end + 1)) as T;
}
