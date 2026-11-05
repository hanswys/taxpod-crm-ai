// Tax Q&A: retrieve → similarity floor → grounded prompt → Gemini (JSON) → check citations → log.
// No Next.js imports, so `npm run ask` and the M4 eval use exactly what the UI uses.
import { z } from "zod";
import { pgErrorCode, sql } from "@/lib/db";
import { classifyLlmError, generateJson, LlmError } from "@/lib/llm";
import { answerSchema, buildPrompt, SYSTEM_INSTRUCTION } from "@/lib/rag/prompt";
import { retrieve, TOP_K, type Passage, type RetrievalMode } from "@/lib/rag/retrieve";
import type { DocType } from "@/lib/rag/sources";

// Below this, even the best passage is off-topic: say so without calling the LLM.
// M4 eval: answerable questions score 0.705–0.761; "capital of France" 0.504; near-domain
// questions (Singapore tax 0.603, Malaysian RPGT 0.601) are only ~0.10 below real ones, so a
// higher floor would risk refusing oddly worded real questions. Those pass; the prompt refuses them.
export const SIMILARITY_FLOOR = 0.55;

const DOC_TYPES = ["public_ruling", "e_invoice", "sst"] as const satisfies readonly DocType[];

export const askInput = z.object({
  question: z
    .string()
    .trim()
    .min(3, "Ask a question (at least 3 characters)")
    .max(500, "Keep the question under 500 characters"),
  docType: z.preprocess((v) => (v === "" || v === "all" ? undefined : v), z.enum(DOC_TYPES).optional()),
});
export type AskInput = z.input<typeof askInput>;

export type Citation = {
  n: number; // the number shown in the answer: [1], [2]… in order of first use
  rank: number; // 1-based position of the passage in the retrieved list
  shortTitle: string;
  title: string;
  section: string | null;
  pageStart: number;
  pageEnd: number;
  publishedOn: string | null;
  href: string; // opens the PDF on the cited page
};

export type NotFoundReason = "low_similarity" | "model_declined" | "no_valid_citations";

export type AskResult =
  | { kind: "answer"; answer: string; citations: Citation[]; passages: Passage[]; model: string; ms: number }
  | { kind: "not_found"; reason: NotFoundReason; message: string; passages: Passage[]; model: string | null; ms: number }
  | { kind: "error"; message: string; retryable: boolean };

const NOT_FOUND_MESSAGE = "The documents in the knowledge base don't cover this question.";

export async function ask(
  input: AskInput,
  { k = TOP_K, mode }: { k?: number; mode?: RetrievalMode } = {},
): Promise<AskResult> {
  const parsed = askInput.safeParse(input);
  if (!parsed.success) {
    return { kind: "error", message: parsed.error.issues[0].message, retryable: false };
  }
  const { question, docType } = parsed.data;
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  let passages: Passage[] = [];

  try {
    ({ passages } = await retrieve(question, { k, docType, mode }));
    if (passages.length === 0) {
      const result: AskResult = {
        kind: "error",
        message: "No documents are loaded yet. Run `npm run ingest` to build the knowledge base.",
        retryable: false,
      };
      await logQuery(question, docType, passages, result, elapsed());
      return result;
    }

    // Guard 1: nothing relevant was found, so don't ask the LLM. (Hybrid and rerank
    // don't keep the best cosine score first, so take the maximum.)
    if (Math.max(...passages.map((p) => p.similarity)) < SIMILARITY_FLOOR) {
      const result: AskResult = {
        kind: "not_found",
        reason: "low_similarity",
        message: NOT_FOUND_MESSAGE,
        passages,
        model: null,
        ms: elapsed(),
      };
      await logQuery(question, docType, passages, result, result.ms);
      return result;
    }

    const { data, model } = await generateJson(buildPrompt(question, passages), SYSTEM_INSTRUCTION, answerSchema);
    const { text, citations } = resolveCitations(data.answer, passages);

    let result: AskResult;
    if (!data.answered) {
      // Guard 2: the model says the passages don't answer it.
      result = { kind: "not_found", reason: "model_declined", message: data.answer || NOT_FOUND_MESSAGE, passages, model, ms: elapsed() };
    } else if (citations.length === 0) {
      // Guard 3: an answer that cites nothing it was given may come from the model's own memory.
      result = { kind: "not_found", reason: "no_valid_citations", message: NOT_FOUND_MESSAGE, passages, model, ms: elapsed() };
    } else {
      result = { kind: "answer", answer: text, citations, passages, model, ms: elapsed() };
    }
    await logQuery(question, docType, passages, result, result.ms, data.answer);
    return result;
  } catch (error) {
    const result = describeError(error);
    console.error("[ask]", error);
    await logQuery(question, docType, passages, result, elapsed(), undefined, error);
    return result;
  }
}

/**
 * Keep only [n] markers that point at a passage we sent, renumber them in order of
 * first use, and drop the rest. Handles "[2]", "[1, 3]" and "[1][3]".
 */
export function resolveCitations(answer: string, passages: Passage[]): { text: string; citations: Citation[] } {
  const numbering = new Map<number, number>(); // passage index (0-based) → shown number
  const text = answer
    .replace(/\s*\[(\d+(?:\s*,\s*\d+)*)\]/g, (marker, list: string) => {
      const shown = list
        .split(",")
        .map((s) => Number(s.trim()) - 1)
        .filter((i) => i >= 0 && i < passages.length)
        .map((i) => {
          if (!numbering.has(i)) numbering.set(i, numbering.size + 1);
          return numbering.get(i)!;
        });
      const unique = [...new Set(shown)];
      const leading = marker.match(/^\s*/)?.[0] ?? "";
      return unique.length ? `${leading}${unique.map((n) => `[${n}]`).join("")}` : "";
    })
    .replace(/(\[\d+\])(?:\s*\1)+/g, "$1") // "[1][1]" → "[1]"
    .trim();

  const citations = [...numbering.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([i, n]) => {
      const p = passages[i];
      return {
        n,
        rank: i + 1,
        shortTitle: p.shortTitle,
        title: p.title,
        section: p.section,
        pageStart: p.pageStart,
        pageEnd: p.pageEnd,
        publishedOn: p.publishedOn,
        href: `/${p.filePath}#page=${p.pageStart}`,
      };
    });
  return { text, citations };
}

function describeError(error: unknown): Extract<AskResult, { kind: "error" }> {
  // A refused connection is an AggregateError (IPv6 + IPv4 attempts) with code ECONNREFUSED.
  const code = (error as { code?: string } | null)?.code;
  if (error instanceof AggregateError || code === "ECONNREFUSED" || code === "ENOTFOUND") {
    return { kind: "error", message: "The database is unavailable. Is Docker running? (`npm run db:up`)", retryable: false };
  }
  if (pgErrorCode(error) === "42P01") {
    return { kind: "error", message: "The database schema is missing a table. See README → Tax Q&A.", retryable: false };
  }
  if (pgErrorCode(error)) {
    return { kind: "error", message: "A database error occurred. Details are in the server log.", retryable: true };
  }
  const llm = error instanceof LlmError ? error : classifyLlmError(error);
  switch (llm.kind) {
    case "auth":
      return { kind: "error", message: "The Gemini API key is missing or invalid. Set GEMINI_API_KEY in .env (see README).", retryable: false };
    case "busy":
      if (llm.quota === "day") {
        const hours = Math.ceil((llm.retryAfterSeconds ?? 0) / 3600);
        return { kind: "error", message: `Gemini's free-tier daily limit is used up${hours ? ` (resets in about ${hours} h)` : ""}. Use another API key, or try again later.`, retryable: false };
      }
      return llm.retryAfterSeconds !== undefined
        ? { kind: "error", message: `Gemini's free-tier limit was reached (5 questions a minute per model). Try again in ${llm.retryAfterSeconds} s.`, retryable: true }
        : { kind: "error", message: "Gemini is busy right now. Try again in a minute.", retryable: true };
    case "model":
      return { kind: "error", message: "The Gemini model isn't available. Check GEMINI_CHAT_MODEL in .env (`npm run check:gemini` lists models).", retryable: false };
    case "bad_output":
      return { kind: "error", message: "Gemini returned an answer in the wrong format. Try again.", retryable: true };
    default:
      return { kind: "error", message: "Something went wrong. Details are in the server log.", retryable: true };
  }
}

/** One row per question, so a bad answer can be traced to what was retrieved. Never breaks the answer. */
async function logQuery(
  question: string,
  docType: DocType | undefined,
  passages: Passage[],
  result: AskResult,
  latencyMs: number,
  rawAnswer?: string,
  error?: unknown,
): Promise<void> {
  try {
    const outcome = result.kind;
    const model = result.kind === "error" ? null : result.model;
    const errorText = error === undefined ? (result.kind === "error" ? result.message : null) : String(error instanceof Error ? error.message : error).slice(0, 1000);
    await sql`
      insert into rag_queries (question, doc_type, chunk_ids, scores, outcome, not_found_reason, answer, model, latency_ms, error)
      values (
        ${question}, ${docType ?? null},
        ${passages.map((p) => p.chunkId)}::bigint[], ${passages.map((p) => p.similarity)}::real[],
        ${outcome}, ${result.kind === "not_found" ? result.reason : null},
        ${rawAnswer ?? null}, ${model}, ${latencyMs}, ${errorText}
      )
    `;
  } catch (logError) {
    console.error("[ask] could not write rag_queries:", logError instanceof Error ? logError.message : logError);
  }
}
