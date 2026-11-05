// Retrieval: embed the question, then top-k cosine similarity search in pgvector.
// No Next.js imports, so `npm run ask` and the M4 eval call this directly.
import { z } from "zod";
import { sql } from "@/lib/db";
import { embed, fallbackChatModel, generateJson, rerankModel, toVector } from "@/lib/llm";
import { buildRerankPrompt, RERANK_INSTRUCTION } from "@/lib/rag/prompt";
import type { DocType } from "@/lib/rag/sources";

// Passages sent to the LLM. Chunks are ~1,300 chars (~330 tokens), so 10 is ~3.3k tokens.
// M4 eval: k = 6 left out the passage with today's SST rate for "current service tax rate
// on legal services" (ranked 9th, behind 8 older Professional Services chunks), so the
// answer quoted the outdated 6%; with 10 the model gave 8% and noted the change.
export const TOP_K = 10;

// How passages are ranked (M4 experiments, measured with `npm run eval -- --mode <mode>`):
// vector = cosine similarity only; hybrid = vector + Postgres full-text, merged by
// reciprocal rank fusion; rerank = vector top 20 reordered by one Gemini call.
export const RETRIEVAL_MODES = ["vector", "hybrid", "rerank"] as const;
export type RetrievalMode = (typeof RETRIEVAL_MODES)[number];
export const RETRIEVAL_MODE: RetrievalMode = "vector";

// Hybrid and rerank pick from this many candidates.
const CANDIDATES = 20;
// Standard RRF constant: damps the difference between rank 1 and rank 2 in either list.
const RRF_K = 60;

// strict: a failed rerank call throws instead of falling back to vector order (the eval
// must not report vector results as rerank results).
type SearchOptions = { k?: number; docType?: DocType; mode?: RetrievalMode; strict?: boolean };

export type Passage = {
  chunkId: number;
  slug: string;
  title: string;
  shortTitle: string;
  docType: DocType;
  filePath: string; // under public/, e.g. documents/pr-8-2025.pdf
  publishedOn: string | null; // YYYY-MM-DD
  section: string | null;
  pageStart: number;
  pageEnd: number;
  content: string;
  similarity: number; // cosine similarity, 1 = identical direction
};

export type Retrieval = { passages: Passage[]; embedMs: number; searchMs: number };

export async function retrieve(question: string, options: SearchOptions = {}): Promise<Retrieval> {
  const started = performance.now();
  const [vector] = await embed([question], "RETRIEVAL_QUERY");
  const embedded = performance.now();
  const passages = await rankPassages(question, vector, options);
  return {
    passages,
    embedMs: Math.round(embedded - started),
    searchMs: Math.round(performance.now() - embedded),
  };
}

/** Top k passages for an already-embedded question (the eval embeds all questions in one call). */
export async function rankPassages(
  question: string,
  vector: number[],
  { k = TOP_K, docType, mode = RETRIEVAL_MODE, strict = false }: SearchOptions = {},
): Promise<Passage[]> {
  switch (mode) {
    case "vector":
      return searchChunks(vector, { k, docType });
    case "hybrid":
      return hybridSearch(question, vector, { k, docType });
    case "rerank": {
      const candidates = await searchChunks(vector, { k: Math.max(k, CANDIDATES), docType });
      try {
        return await rerank(question, candidates, k);
      } catch (error) {
        // A rerank problem never breaks an answer: keep vector order.
        if (strict) throw error;
        console.warn(`[rerank] kept vector order: ${error instanceof Error ? error.message.slice(0, 200) : error}`);
        return candidates.slice(0, k);
      }
    }
  }
}

/**
 * With a doc_type filter Postgres scans that type's chunks exactly (checked with
 * EXPLAIN on 497 chunks), so a filter never returns fewer than k. Without one it may
 * use the HNSW index, which is approximate but fine at this size.
 */
export async function searchChunks(
  vector: number[],
  { k = TOP_K, docType }: { k?: number; docType?: DocType } = {},
): Promise<Passage[]> {
  const v = toVector(vector);
  return sql<Passage[]>`
    select c.id as "chunkId", d.slug, d.title, d.short_title as "shortTitle", d.doc_type as "docType",
           d.file_path as "filePath", to_char(d.published_on, 'YYYY-MM-DD') as "publishedOn",
           c.section, c.page_start as "pageStart", c.page_end as "pageEnd", c.content,
           1 - (c.embedding <=> ${v}::vector) as similarity
    from chunks c
    join documents d on d.id = c.document_id
    where ${docType ?? null}::text is null or d.doc_type = ${docType ?? null}
    order by c.embedding <=> ${v}::vector
    limit ${k}
  `;
}

/**
 * Vector top 20 and full-text top 20, merged by reciprocal rank fusion: score = Σ 1 / (60 + rank).
 * Full text helps exact terms the embedding blurs ("RM2,000", "DST-02", "hire purchase").
 * The question's words are OR-ed (plainto_tsquery ANDs them, which rarely matches a whole question).
 * tsvectors are computed at query time: fine for ~500 chunks; a stored column + GIN index if kept.
 */
async function hybridSearch(
  question: string,
  vector: number[],
  { k, docType }: { k: number; docType?: DocType },
): Promise<Passage[]> {
  const v = toVector(vector);
  const type = docType ?? null;
  const ranked = await sql<{ id: number }[]>`
    with vec as (
      select c.id, row_number() over (order by c.embedding <=> ${v}::vector) as rank
      from chunks c join documents d on d.id = c.document_id
      where ${type}::text is null or d.doc_type = ${type}
      order by c.embedding <=> ${v}::vector
      limit ${CANDIDATES}
    ),
    query as (
      select nullif(replace(plainto_tsquery('english', ${question})::text, '&', '|'), '')::tsquery as q
    ),
    fts as (
      select c.id, row_number() over (order by ts_rank_cd(to_tsvector('english', c.content), query.q) desc) as rank
      from chunks c join documents d on d.id = c.document_id, query
      where (${type}::text is null or d.doc_type = ${type}) and to_tsvector('english', c.content) @@ query.q
      order by ts_rank_cd(to_tsvector('english', c.content), query.q) desc
      limit ${CANDIDATES}
    )
    select id from (select * from vec union all select * from fts) ranks
    group by id
    order by sum(1.0 / (${RRF_K} + rank)) desc
    limit ${k}
  `;
  return passagesById(ranked.map((r) => r.id), v);
}

/** The passages for these chunk IDs, in the given order, with their cosine similarity to the question. */
async function passagesById(ids: number[], v: string): Promise<Passage[]> {
  if (ids.length === 0) return [];
  const rows = await sql<Passage[]>`
    select c.id as "chunkId", d.slug, d.title, d.short_title as "shortTitle", d.doc_type as "docType",
           d.file_path as "filePath", to_char(d.published_on, 'YYYY-MM-DD') as "publishedOn",
           c.section, c.page_start as "pageStart", c.page_end as "pageEnd", c.content,
           1 - (c.embedding <=> ${v}::vector) as similarity
    from chunks c
    join documents d on d.id = c.document_id
    where c.id = any(${ids}::bigint[])
  `;
  const byId = new Map(rows.map((p) => [p.chunkId, p]));
  return ids.map((id) => byId.get(id)!);
}

const rerankSchema = z.object({
  ranking: z.array(z.number().int()).describe("Numbers of the passages that help answer the question, most useful first"),
});

/**
 * One Gemini call orders the candidates by how well they answer the question. Passages the
 * model leaves out keep their vector order after the ones it ranked. Uses a Flash-Lite
 * model (GEMINI_RERANK_MODEL, then the fallback model) to spare the Flash daily quota for answers.
 */
async function rerank(question: string, candidates: Passage[], k: number): Promise<Passage[]> {
  if (candidates.length <= 1) return candidates.slice(0, k);
  const { data } = await generateJson(buildRerankPrompt(question, candidates), RERANK_INSTRUCTION, rerankSchema, {
    models: [...new Set([rerankModel(), fallbackChatModel()])],
  });
  const order = [...new Set(data.ranking.map((n) => n - 1).filter((i) => i >= 0 && i < candidates.length))];
  const rest = candidates.map((_, i) => i).filter((i) => !order.includes(i));
  return [...order, ...rest].slice(0, k).map((i) => candidates[i]);
}
