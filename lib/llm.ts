import { GoogleGenAI } from "@google/genai";
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
    httpOptions: { timeout: 30_000, retryOptions: { attempts: 3, maxDelay: 4 } },
  });
  return client;
}

export function chatModel(): string {
  return process.env.GEMINI_CHAT_MODEL || "gemini-3.5-flash";
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

// Gemini only returns unit-length vectors at the full 3072 dims. Scaling to
// length 1 keeps cosine and inner-product search equivalent, and similarity
// scores comparable across chunks.
function normalise(v: number[]): number[] {
  const length = Math.hypot(...v);
  return length === 0 ? v : v.map((x) => x / length);
}
