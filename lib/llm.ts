import { ApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";
import { requireEnv } from "@/lib/env";

// Every Gemini call in the app goes through this file.

// Must match vector(768) in db/schema.sql. gemini-embedding-001 defaults to
// 3072 dims, but pgvector's HNSW index supports at most 2000.
export const EMBEDDING_DIMS = 768;

// Documents and queries are embedded differently for retrieval.
export type EmbedTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

let client: GoogleGenAI | undefined;

function gemini(): GoogleGenAI {
  client ??= new GoogleGenAI({
    apiKey: requireEnv("GEMINI_API_KEY"),
    // The SDK's defaults (5 attempts, backoff up to 60s) let one call hang for
    // minutes when the free tier is overloaded. Fail within ~1.5 minutes instead.
    // 429s aren't retried here: the quota resets in 40+ seconds (per minute) or hours
    // (per day), so a quick retry only spends quota. Callers decide (fallback model in
    // generateJson, wait-and-retry in ingest).
    httpOptions: {
      timeout: 30_000,
      retryOptions: { attempts: 3, maxDelay: 4, httpStatusCodes: [408, 500, 502, 503, 504] },
    },
  });
  return client;
}

export function chatModel(): string {
  return process.env.GEMINI_CHAT_MODEL || "gemini-3.5-flash";
}

// Tried once when the chat model is busy, rate-limited or gone. The free tier returns
// 503 "high demand" often (M0, M3) and allows only 20 requests a day per Flash model.
// A Flash-Lite model has its own quota and capacity, so it rarely fails at the same time.
export function fallbackChatModel(): string {
  return process.env.GEMINI_FALLBACK_MODEL || "gemini-3.1-flash-lite";
}

// Reranking passages (M4 experiment). A Flash-Lite model with its own quota, so reranking
// doesn't spend the answer models' 20 requests a day.
export function rerankModel(): string {
  return process.env.GEMINI_RERANK_MODEL || "gemini-3.5-flash-lite";
}

// Meeting Notes extraction (M5). Flash-Lite first: on the eval:notes samples it matched Flash
// item for item in 3–11 s instead of 16–18 s, and it leaves Flash's 20 requests a day for Tax Q&A.
// Flash is the fallback.
export function notesModel(): string {
  return process.env.GEMINI_NOTES_MODEL || "gemini-3.1-flash-lite";
}

export function embedModel(): string {
  return process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001";
}

export async function generate(prompt: string, systemInstruction?: string): Promise<string> {
  const response = await gemini().models.generateContent({
    model: chatModel(),
    contents: prompt,
    config: systemInstruction ? { systemInstruction } : undefined,
  });
  return response.text ?? "";
}

/**
 * Why a Gemini call failed, in terms the UI can act on:
 * busy = try again later; auth = the key is missing or wrong; model = the model name doesn't exist
 * (retired or mistyped); bad_output = the reply didn't match the schema.
 */
export class LlmError extends Error {
  // Set on 429s. Free tier per model (seen in M3): 5 generate requests a minute, 20 a day.
  readonly retryAfterSeconds?: number;
  readonly quota?: "minute" | "day";
  constructor(
    readonly kind: "busy" | "auth" | "model" | "bad_output" | "other",
    message: string,
    options?: { cause?: unknown; retryAfterSeconds?: number; quota?: "minute" | "day" },
  ) {
    super(message, options);
    this.retryAfterSeconds = options?.retryAfterSeconds;
    this.quota = options?.quota;
    this.name = "LlmError";
  }
}

export function classifyLlmError(error: unknown): LlmError {
  if (error instanceof LlmError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("Missing env var GEMINI_API_KEY")) return new LlmError("auth", message, { cause: error });
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return new LlmError("busy", message, {
        cause: error,
        retryAfterSeconds: retryAfterSeconds(message),
        quota: /per day/i.test(message) ? "day" : /per minute/i.test(message) ? "minute" : undefined,
      });
    }
    if ([500, 503, 504].includes(error.status)) return new LlmError("busy", message, { cause: error });
    if ([401, 403].includes(error.status) || /API key/i.test(message)) return new LlmError("auth", message, { cause: error });
    if (error.status === 404) return new LlmError("model", message, { cause: error });
  }
  // The SDK's 30s timeout aborts the request.
  if (error instanceof Error && /abort|timeout|timed out/i.test(`${error.name} ${message}`)) {
    return new LlmError("busy", message, { cause: error });
  }
  return new LlmError("other", message, { cause: error });
}

/**
 * Generate a reply that must match `schema`. Gemini enforces the JSON schema while
 * generating; zod checks it again here. If the chat model is busy (429/5xx/timeout),
 * no longer exists (404: M0 saw a planned model retired), or replies with something
 * that doesn't parse, the fallback model is tried once. `models` overrides the order
 * (rerank uses its own model first).
 */
export async function generateJson<T>(
  prompt: string,
  systemInstruction: string,
  schema: z.ZodType<T>,
  { models = [...new Set([chatModel(), fallbackChatModel()])] }: { models?: string[] } = {},
): Promise<{ data: T; model: string }> {
  const jsonSchema = z.toJSONSchema(schema);
  let lastError: LlmError | undefined;

  for (const model of models) {
    try {
      const response = await gemini().models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseJsonSchema: jsonSchema,
          // Lookup and summarising, not reasoning: LOW keeps answers to a few seconds.
          // (MINIMAL isn't accepted by every Gemini 3 Flash model.) Temperature stays at
          // the default, as Google recommends for Gemini 3.
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });
      const parsed = schema.safeParse(parseJson(response.text));
      if (!parsed.success) {
        throw new LlmError("bad_output", `${model} returned output that doesn't match the schema: ${response.text?.slice(0, 200)}`);
      }
      return { data: parsed.data, model };
    } catch (error) {
      lastError = classifyLlmError(error);
      if (lastError.kind === "auth" || lastError.kind === "other") throw lastError;
      console.warn(`[llm] ${model} failed (${lastError.kind}): ${lastError.message.slice(0, 200)}`);
    }
  }
  throw lastError!;
}

/** "Please retry in 42.1s" or "retry in 16h17m38.8s" → seconds. */
function retryAfterSeconds(message: string): number | undefined {
  const match = message.match(/retry in ((?:\d+h)?(?:\d+m)?(?:[\d.]+s)?)/i)?.[1];
  if (!match) return undefined;
  const part = (unit: string) => Number(match.match(new RegExp(`([\\d.]+)${unit}`))?.[1] ?? 0);
  const seconds = part("h") * 3600 + part("m") * 60 + part("s");
  return seconds > 0 ? Math.ceil(seconds) : undefined;
}

function parseJson(text: string | undefined): unknown {
  try {
    return JSON.parse(text ?? "");
  } catch {
    return undefined;
  }
}

export async function embed(texts: string[], taskType: EmbedTask): Promise<number[][]> {
  const response = await gemini().models.embedContent({
    model: embedModel(),
    contents: texts,
    config: { taskType, outputDimensionality: EMBEDDING_DIMS },
  });
  const vectors = (response.embeddings ?? []).map((e) => e.values ?? []);
  if (vectors.length !== texts.length) {
    throw new Error(`Expected ${texts.length} embeddings, got ${vectors.length}`);
  }
  for (const v of vectors) {
    if (v.length !== EMBEDDING_DIMS) {
      throw new Error(`Expected ${EMBEDDING_DIMS}-dim embedding, got ${v.length}`);
    }
  }
  return vectors.map(normalise);
}

// pgvector's text format: "[0.1,0.2,…]"
export function toVector(values: number[]): string {
  return `[${values.join(",")}]`;
}

// Gemini only returns unit-length vectors at the full 3072 dims. Scaling to
// length 1 keeps cosine and inner-product search equivalent, and similarity
// scores comparable across chunks.
function normalise(v: number[]): number[] {
  const length = Math.hypot(...v);
  return length === 0 ? v : v.map((x) => x / length);
}
