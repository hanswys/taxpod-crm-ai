// Knowledge-base ingestion: npm run ingest [-- --dry-run] [--force] [--only <slug>]
//
// For each document in lib/rag/sources.ts: parse the PDF → clean → chunk → embed
// (gemini-embedding-001, RETRIEVAL_DOCUMENT) → store in documents + chunks.
// Unchanged documents are skipped without any API call, so re-running is cheap.
//
// --dry-run   parse and chunk only (no API key or DB needed); writes tmp/chunks.jsonl
// --force     re-ingest even if unchanged
// --only      just this document (repeatable); skips deleting documents not in the manifest
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { ApiError } from "@google/genai";
import { CHUNK_OPTIONS, chunkDocument, embeddingText, type Chunk } from "@/lib/rag/chunk";
import { cleanPages, extractPages } from "@/lib/rag/pdf";
import { CHUNKER_VERSION, SOURCES, type Source } from "@/lib/rag/sources";
import { embed, embedModel, EMBEDDING_DIMS } from "@/lib/llm";

const DOCUMENTS_DIR = "public/documents";
const PREVIEW_FILE = "tmp/chunks.jsonl";
// Free tier: 30,000 embedding tokens per minute (seen in M2's first run; Google doesn't
// publish it). Batches are sized and paced to stay under that, with headroom because
// tokens are estimated from characters (measured: ~4.4 chars per token).
const EMBED_MAX_TEXTS = 100; // most texts one embedContent request accepts
const EMBED_BATCH_TOKENS = 8_000;
const EMBED_TOKENS_PER_MINUTE = 24_000;
const estimateTokens = (text: string) => Math.ceil(text.length / 4);

const { values: args } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    force: { type: "boolean", default: false },
    only: { type: "string", multiple: true },
  },
});

type Row = { slug: string; pages: number; chunks: number; avgChars: number; maxChars: number; status: string };

async function main() {
  const unknown = (args.only ?? []).filter((slug) => !SOURCES.some((s) => s.slug === slug));
  if (unknown.length) throw new Error(`Unknown --only slug: ${unknown.join(", ")}`);
  const sources = args.only ? SOURCES.filter((s) => args.only!.includes(s.slug)) : SOURCES;

  // Loaded lazily so --dry-run works without DATABASE_URL.
  const db = args["dry-run"] ? null : await import("@/lib/db");
  const rows: Row[] = [];
  const preview: string[] = [];
  let embedCalls = 0;

  try {
    for (const source of sources) {
      const started = performance.now();
      const bytes = await readFile(join(DOCUMENTS_DIR, source.file));
      const hash = contentHash(bytes, source);

      if (db && !args.force) {
        const [existing] = await db.sql<{ content_hash: string; page_count: number; chunks: number }[]>`
          select d.content_hash, d.page_count, count(c.id) as chunks
          from documents d left join chunks c on c.document_id = d.id
          where d.slug = ${source.slug}
          group by d.id
        `;
        if (existing?.content_hash === hash) {
          rows.push({ slug: source.slug, pages: existing.page_count, chunks: existing.chunks, avgChars: 0, maxChars: 0, status: "unchanged, skipped" });
          continue;
        }
      }

      const pages = await extractPages(join(DOCUMENTS_DIR, source.file));
      const chunks = chunkDocument(cleanPages(pages));
      if (chunks.length === 0) throw new Error(`${source.slug}: no text extracted`);
      const stats = { slug: source.slug, pages: pages.length, chunks: chunks.length, ...sizes(chunks) };

      if (!db) {
        chunks.forEach((chunk, index) => preview.push(JSON.stringify({ slug: source.slug, index, ...chunk, chars: chunk.content.length })));
        rows.push({ ...stats, status: "dry run" });
        continue;
      }

      // Embed before touching the DB: if Gemini fails, the old chunks stay in place.
      const texts = chunks.map((chunk) => embeddingText(source.title, chunk));
      const groups = batches(texts);
      console.log(`${source.slug}: embedding ${texts.length} chunks in ${groups.length} calls…`);
      const vectors: number[][] = [];
      for (const group of groups) {
        await waitForQuota(group.reduce((n, t) => n + estimateTokens(t), 0));
        vectors.push(...(await embedWithRetry(group)));
      }
      embedCalls += groups.length;

      await db.sql.begin(async (tx) => {
        const [{ id }] = await tx<{ id: number }[]>`
          insert into documents (slug, title, short_title, doc_type, issuer, published_on, source_url, file_path, content_hash, page_count)
          values (${source.slug}, ${source.title}, ${source.shortTitle}, ${source.docType}, ${source.issuer},
                  ${source.publishedOn}, ${source.sourceUrl}, ${`documents/${source.file}`}, ${hash}, ${pages.length})
          on conflict (slug) do update set
            title = excluded.title, short_title = excluded.short_title, doc_type = excluded.doc_type,
            issuer = excluded.issuer, published_on = excluded.published_on, source_url = excluded.source_url,
            file_path = excluded.file_path, content_hash = excluded.content_hash, page_count = excluded.page_count,
            ingested_at = now()
          returning id
        `;
        await tx`delete from chunks where document_id = ${id}`;
        await tx`
          insert into chunks ${tx(
            chunks.map((chunk, index) => ({
              document_id: id,
              chunk_index: index,
              content: chunk.content,
              page_start: chunk.pageStart,
              page_end: chunk.pageEnd,
              section: chunk.section,
              token_count: Math.ceil(chunk.content.length / 4), // estimate
              embedding: toVector(vectors[index]),
            })),
          )}
        `;
      });
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      rows.push({ ...stats, status: `ingested (${groups.length} embed calls, ${seconds}s)` });
    }

    // Documents removed from the manifest are removed from the knowledge base (chunks cascade).
    if (db && !args.only) {
      const removed = await db.sql<{ slug: string }[]>`
        delete from documents where slug <> all(${SOURCES.map((s) => s.slug)}) returning slug
      `;
      for (const { slug } of removed) rows.push({ slug, pages: 0, chunks: 0, avgChars: 0, maxChars: 0, status: "removed" });
    }
  } finally {
    await db?.sql.end();
  }

  printTable(rows);
  const kept = rows.filter((r) => r.status !== "removed");
  const removed = rows.length - kept.length;
  const total = kept.reduce((n, r) => n + r.chunks, 0);
  console.log(
    `\n${kept.length} documents, ${total} chunks, ${embedCalls} embed calls${removed ? `, ${removed} removed` : ""}`,
  );

  if (!db) {
    await mkdir("tmp", { recursive: true });
    await writeFile(PREVIEW_FILE, preview.join("\n") + "\n");
    console.log(`Chunks written to ${PREVIEW_FILE}`);
  }
}

// Anything that changes the stored chunks or vectors changes the hash, so the
// document is re-ingested: the file, its manifest entry, the chunker, the embedding model.
function contentHash(bytes: Buffer, source: Source): string {
  return createHash("sha256")
    .update(bytes)
    .update(JSON.stringify({ source, CHUNKER_VERSION, CHUNK_OPTIONS, model: embedModel(), dims: EMBEDDING_DIMS }))
    .digest("hex");
}

/** Groups texts into requests of at most EMBED_MAX_TEXTS texts and ~EMBED_BATCH_TOKENS tokens. */
function batches(texts: string[]): string[][] {
  const groups: string[][] = [];
  let tokens = 0;
  for (const text of texts) {
    const group = groups.at(-1);
    const t = estimateTokens(text);
    if (!group || group.length === EMBED_MAX_TEXTS || tokens + t > EMBED_BATCH_TOKENS) {
      groups.push([text]);
      tokens = t;
    } else {
      group.push(text);
      tokens += t;
    }
  }
  return groups;
}

// Tokens sent in the last minute, across all documents.
const recent: { at: number; tokens: number }[] = [];

/** Waits until sending `tokens` more keeps the last 60 seconds under EMBED_TOKENS_PER_MINUTE. */
async function waitForQuota(tokens: number) {
  for (;;) {
    while (recent.length && Date.now() - recent[0].at > 60_000) recent.shift();
    const used = recent.reduce((n, r) => n + r.tokens, 0);
    if (recent.length === 0 || used + tokens <= EMBED_TOKENS_PER_MINUTE) break;
    await sleep(recent[0].at + 60_000 - Date.now() + 250);
  }
  recent.push({ at: Date.now(), tokens });
}

// Pacing should avoid 429s; if one still happens, wait as long as the API says
// ("Please retry in 34.1s") rather than the SDK's few seconds (lib/llm.ts).
async function embedWithRetry(texts: string[]): Promise<number[][]> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await embed(texts, "RETRIEVAL_DOCUMENT");
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 429) || attempt > 4) throw error;
      const seconds = Math.ceil(Number(/retry in ([\d.]+)s/i.exec(error.message)?.[1] ?? 30)) + 1;
      console.warn(`  rate limited, waiting ${seconds}s…`);
      await sleep(seconds * 1000);
    }
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// pgvector's text format: "[0.1,0.2,…]"
function toVector(values: number[]): string {
  return `[${values.join(",")}]`;
}

function sizes(chunks: Chunk[]) {
  const lengths = chunks.map((c) => c.content.length);
  return { avgChars: Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length), maxChars: Math.max(...lengths) };
}

function printTable(rows: Row[]) {
  const header = ["document", "pages", "chunks", "avg chars", "max chars", "status"];
  const cells = rows.map((r) => [r.slug, r.pages, r.chunks, r.avgChars || "", r.maxChars || "", r.status].map(String));
  const widths = header.map((h, i) => Math.max(h.length, ...cells.map((c) => c[i].length)));
  const line = (c: string[]) => c.map((v, i) => (i === 0 || i === 5 ? v.padEnd(widths[i]) : v.padStart(widths[i]))).join("  ");
  console.log(line(header));
  for (const c of cells) console.log(line(c));
}

main().catch((error) => {
  console.error(describeError(error));
  process.exit(1);
});

// Gemini errors carry the API's JSON response as their message; show just the text.
function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    try {
      return `Gemini API error ${error.status}: ${JSON.parse(error.message).error.message}`;
    } catch {
      return `Gemini API error ${error.status}: ${error.message}`;
    }
  }
  return error instanceof Error ? error.message : String(error);
}
