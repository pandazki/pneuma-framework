import { ChatOpenAI } from "@langchain/openai";

export interface ChatOptions {
  model?: string;
  systemPrompt: string;
  userInput: string;
}

const DEFAULT_MODEL = process.env.OPENROUTER_CHAT_MODEL ?? "anthropic/claude-opus-4.7";
const DEFAULT_EMBED_MODEL = process.env.OPENROUTER_EMBED_MODEL ?? "jina-ai/jina-embeddings-v3";

function requireKey(): string {
  const k = process.env.OPENROUTER_API_KEY;
  if (!k) throw new Error("OPENROUTER_API_KEY is required");
  return k;
}

export async function chat(opts: ChatOptions): Promise<string> {
  const client = new ChatOpenAI({
    model: opts.model ?? DEFAULT_MODEL,
    apiKey: requireKey(),
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
 * Direct /embeddings call — LangChain's OpenAI embeddings binding sometimes
 * mismatches OpenRouter's embedding endpoint, so we call fetch ourselves.
 */
export async function embed(input: string, model: string = DEFAULT_EMBED_MODEL): Promise<Float32Array> {
  const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${requireKey()}`,
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
