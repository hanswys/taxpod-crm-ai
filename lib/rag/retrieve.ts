// Retrieval: embed the question, then top-k cosine similarity search in pgvector.
// No Next.js imports, so `npm run ask` and the M4 eval call this directly.
import { sql } from "@/lib/db";
import { embed, toVector } from "@/lib/llm";
import type { DocType } from "@/lib/rag/sources";

// Passages sent to the LLM. Chunks are ~1,300 chars (~330 tokens), so 6 is ~2k tokens.
// M2 saw the best passage ranked 2nd or 3rd, so 3 is too few. Tuned in M4.
export const TOP_K = 6;

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

export async function retrieve(
  question: string,
  { k = TOP_K, docType }: { k?: number; docType?: DocType } = {},
): Promise<Retrieval> {
  const started = performance.now();
  const [vector] = await embed([question], "RETRIEVAL_QUERY");
  const embedded = performance.now();
  const passages = await searchChunks(vector, { k, docType });
  return {
    passages,
    embedMs: Math.round(embedded - started),
    searchMs: Math.round(performance.now() - embedded),
  };
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
