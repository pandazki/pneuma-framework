import { ChatOpenAI } from "@langchain/openai";

export interface ChatOptions {
  model?: string;
  systemPrompt: string;
  userInput: string;
}

const DEFAULT_CHAT_MODEL = process.env.OPENROUTER_CHAT_MODEL ?? "anthropic/claude-opus-4.7";

// Embedding provider resolution, in priority order:
//   1. Jina official API        — when JINA_API_KEY is set (preferred — first-party)
//   2. OpenRouter → OpenAI      — when only OPENROUTER_API_KEY is set
// Override with EMBED_PROVIDER=jina|openrouter and EMBED_MODEL=<slug>.
const EMBED_PROVIDER =
  (process.env.EMBED_PROVIDER as "jina" | "openrouter" | undefined)
  ?? (process.env.JINA_API_KEY ? "jina" : "openrouter");
const DEFAULT_EMBED_MODEL =
  process.env.EMBED_MODEL
  ?? (EMBED_PROVIDER === "jina" ? "jina-embeddings-v3" : "openai/text-embedding-3-small");

function requireOpenRouterKey(): string {
  const k = process.env.OPENROUTER_API_KEY;
  if (!k) throw new Error("OPENROUTER_API_KEY is required");
  return k;
}

function requireJinaKey(): string {
  const k = process.env.JINA_API_KEY;
  if (!k) throw new Error("JINA_API_KEY is required for embed provider=jina");
  return k;
}

export async function chat(opts: ChatOptions): Promise<string> {
  const client = new ChatOpenAI({
    model: opts.model ?? DEFAULT_CHAT_MODEL,
    apiKey: requireOpenRouterKey(),
    configuration: { baseURL: "https://openrouter.ai/api/v1" },
    temperature: 0.4,
  });
  const res = await client.invoke([
    { role: "system", content: opts.systemPrompt },
    { role: "user", content: opts.userInput },
  ]);
  return typeof res.content === "string" ? res.content : JSON.stringify(res.content);
}

/**
 * Produces a Float32 embedding for `input`. Uses Jina's first-party API when
 * JINA_API_KEY is available, otherwise falls back to OpenRouter→OpenAI.
 */
export async function embed(input: string, model: string = DEFAULT_EMBED_MODEL): Promise<Float32Array> {
  return EMBED_PROVIDER === "jina" ? embedViaJina(input, model) : embedViaOpenRouter(input, model);
}

async function embedViaJina(input: string, model: string): Promise<Float32Array> {
  const res = await fetch("https://api.jina.ai/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${requireJinaKey()}`,
      "Content-Type": "application/json",
    },
    // task=retrieval.passage is the right preset when storing content for
    // later semantic similarity. For query-time lookups, use retrieval.query.
    body: JSON.stringify({ model, input: [input], task: "retrieval.passage" }),
  });
  if (!res.ok) throw new Error(`jina /embeddings: ${res.status} ${await res.text()}`);
  const body = await res.json() as { data: Array<{ embedding: number[] }> };
  const arr = body.data[0]?.embedding;
  if (!arr) throw new Error("jina /embeddings: missing data[0].embedding");
  return Float32Array.from(arr);
}

async function embedViaOpenRouter(input: string, model: string): Promise<Float32Array> {
  const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${requireOpenRouterKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input }),
  });
  if (!res.ok) throw new Error(`openrouter /embeddings: ${res.status} ${await res.text()}`);
  const body = await res.json() as { data: Array<{ embedding: number[] }> };
  const arr = body.data[0]?.embedding;
  if (!arr) throw new Error("openrouter /embeddings: missing data[0].embedding");
  return Float32Array.from(arr);
}
