# M2 — RAG: knowledge base & ingestion

**Status:** Done (not yet committed)
**Dates:** 2026-11-05 → 2026-11-06
**Branch / PR:** `hanswys/pem64`

## 1. Goal

`npm run ingest` turns a fixed set of public Malaysian tax PDFs into searchable chunks: it parses each PDF page by page, splits the text into section-aware chunks that remember their page range and heading, embeds them with `gemini-embedding-001`, and stores them in `documents` + `chunks` (pgvector). Re-running it skips unchanged documents and makes no API calls.

Covers brief Part 2 (1) "ingest at least 5 publicly available documents" and (2) "parse, chunk, embed and store the chunks in a vector database". It also sets up what M3 needs for (4) citations (document name + page/section) and the metadata filter bonus (`doc_type`), and gives M4 stable document IDs to name as "expected source".

Not in scope: retrieval, prompts, chat UI (M3); the eval set (M4).

## 2. Decisions

All six open choices (D-a to D-d) were agreed on 2026-11-04 as recommended. The rest follow from earlier decisions or the spike (§7 "Spike").

| Decision | Choice | Why | Alternatives considered |
|---|---|---|---|
| **D-a. Document set** | **Decided: 9 PDFs, 3 types** (list in §3.1): 2 e-Invoice guidelines, 4 recent Public Rulings, 3 SST industry guides | Matches taxPOD's topics (tax law, SST, e-invoicing). Three `doc_type`s make the M3 metadata filter meaningful. Picked for overlap a sales rep would hit (e.g. SME thresholds appear in both the e-Invoice guideline and PR 8/2025), which makes retrieval non-trivial and the eval more honest. ~445 pages, ~500 chunks: big enough to be real, small enough to embed in a few calls. | 5–6 docs (fastest, but only just meets the brief); 15+ docs (more embedding quota and spot-checking for little gain); HTML pages (LHDN's HTML pages are mostly navigation; the substance is in PDFs) |
| **D-b. Where the PDFs live** | **Decided: commit them to `public/documents/`** with a manifest recording each one's source URL, version and date | Reproducible: two of the URLs found by search today were already 404s, and the e-Invoice guideline URL search returned was 2 versions old. Total ~5 MB of public government documents. Living under `public/` lets M3 citations link straight to `/documents/<file>.pdf#page=N`. | Download script from the source URLs (smaller repo, but breaks when LHDN / Customs move files, which they do); `data/` folder outside `public/` (no clickable citations without a route to serve them) |
| **D-b2. Parser / ingestion language (PLAN D5)** | **Decided: TypeScript with [`unpdf`](https://github.com/unjs/unpdf)** (Mozilla pdf.js, packaged for Node) | Tested on all 9 docs (§7 "Spike"): every page has a text layer, reading order is correct, line breaks are kept (needed for heading detection), and it returns text per page. No Python needed, so the reviewer's setup stays Node + Docker. | `pdf-parse` (older wrapper around an old pdf.js; page split is clumsier); Python + PyMuPDF (excellent, but adds a second runtime for no gain on these files); LLM-based parsing (slow, costs quota, not needed: no scans) |
| **D-c. Chunking (PLAN D6)** | **Decided: section-aware, with a size cap and overlap.** Clean each page → split into paragraphs → find headings (from the document's own table of contents, see §3.3) → pack paragraphs into chunks of up to **~1,500 characters (~350–400 tokens)**, never across a top-level section boundary, with **one paragraph of overlap**. Each chunk keeps `page_start`/`page_end` and its `section` heading | Tax documents are organised in numbered paragraphs under numbered headings, and answers usually sit inside one section. Keeping chunks inside a section gives clean citations ("PR 8/2025, §6, p. 9") and avoids mixing two topics in one vector. ~1,500 chars fits a typical sub-section (2–4 numbered paragraphs); small enough to be precise, large enough to keep a rule with its condition. Overlap stops a rule split across two chunks from being lost. Size is a parameter: M4 tunes it against hit rate. | Fixed-size windows (simple, but cuts through paragraphs and tables, and loses the section label); one chunk per page (pages are arbitrary breaks in these docs; long pages make blurry vectors); LLM / semantic chunking (slow, uses quota, harder to explain) |
| **D-c2. What gets embedded** | **Decided: embed `"<doc title> — <section>\n\n<chunk text>"`; store only the chunk text in `content`** | A chunk like "(e) Taxpayers with an annual turnover … less than RM1,000,000" doesn't say it's about e-Invoice exemptions. Prefixing title + heading puts that context into the vector (a cheap form of "contextual retrieval"). Stored `content` stays clean for the prompt and the UI. | Embed raw chunk text only (weaker on short or list-like chunks); LLM-written chunk summaries (better still, but one LLM call per chunk on the free tier) |
| **D-d. Page number in citations** | **Decided: PDF page number** (1-based position in the file) | Matches what the PDF viewer shows and what `#page=N` links open, so a reviewer can click a citation and land on the right page. Printed page numbers differ (PR 8/2025's PDF page 5 is printed "Page 2 of 26") and some pages have none. | Printed page number (matches the paper document, but has to be parsed per publisher and doesn't work with `#page=`); both (more to show and explain) |
| Embedding model (PLAN D2 follow-up) | **Keep `gemini-embedding-001` @ 768 dims.** No switch to `gemini-embedding-2` now | Already wired and verified in M0. Switching is one env var + a re-ingest, so it's best decided with numbers: if time allows, M4 runs the eval on both. | Switch now, without evidence |
| Embedding task type | `RETRIEVAL_DOCUMENT` for chunks (M3 uses `RETRIEVAL_QUERY` for questions) | Gemini embeds the two sides differently for retrieval; `lib/llm.ts` already supports it. | `SEMANTIC_SIMILARITY` for both |
| Re-ingest / idempotency | `content_hash` = sha256 of **file bytes + manifest entry + `CHUNKER_VERSION` + chunk settings + embedding model/dims**. Unchanged → skip (no API calls). Changed → chunk + embed first, then replace that document's chunks **in one transaction**. Documents no longer in the manifest are deleted. `--force` re-ingests everything | Hashing only the file would wrongly skip documents after the chunker or embedding model changes (M4 may compare models). Embedding before the transaction means a failed API call leaves the old chunks in place. | Truncate and reload everything every run (simple, but re-embeds ~500 chunks each time and burns free-tier quota) |
| Embedding batches | _Changed after the first real run (§7):_ batches of **≤ 8k estimated tokens** (and ≤ 100 texts), paced by a rolling **24k tokens/minute** budget; on a 429 wait as long as the API's "retry in Ns" says | The free tier allows 30k embedding tokens/minute and the set is ~175k tokens, so 100-chunk batches can never succeed. Free-tier limits aren't published any more (M0); measure them in this milestone and record them in §7. | Parallel calls (risks 429s for little time saved); Gemini Batch API (async job, overkill) |
| `token_count` | Estimate as `ceil(chars / 4)`, documented as an estimate | Only used for stats and the M3 prompt budget. Calling `countTokens` per chunk would double API calls. | Gemini `countTokens`; a tokenizer dependency |
| Dry run | `npm run ingest -- --dry-run`: parse + chunk only, no API key or DB needed; prints per-doc stats and writes all chunks to `tmp/chunks.jsonl` (gitignored) for review | Chunking can be checked and tuned without spending quota. Also lets a reviewer see the pipeline without a key. | Separate inspect script |
| Tests | No unit test framework (same as M1). Verify with the dry-run output, spot-checks against the PDFs, and SQL checks (§5) | The real test of chunking is retrieval quality, which M4 measures. | Vitest for the chunker |

## 3. Design

### 3.1 Document set

All downloaded and parsed in the spike (2026-11-04). Versions are the latest on the official pages on that date.

| Slug | Title (as cited) | `doc_type` | Issuer | Published | PDF pages | Source |
|---|---|---|---|---|---|---|
| `einvoice-guideline` | e-Invoice Guideline (Version 4.8) | `e_invoice` | LHDN | 2026-08-30 | 62 | hasil.gov.my → e-Invois → Garis Panduan |
| `einvoice-specific-guideline` | e-Invoice Specific Guideline (Version 4.9) | `e_invoice` | LHDN | 2026-09-07 | 138 | same page |
| `pr-8-2025` | Public Ruling No. 8/2025: Tax Treatment for Micro, Small and Medium Companies | `public_ruling` | LHDN | 2025-12-22 | 29 | hasil.gov.my → Public Rulings |
| `pr-7-2025` | Public Ruling No. 7/2025: Taxation of a Resident Individual Part I – Gifts or Contributions and Allowable Deductions | `public_ruling` | LHDN | 2025-12-05 | 68 | same page |
| `pr-3-2024` | Public Ruling No. 3/2024: Tax Borne by Employers | `public_ruling` | LHDN | 2024-12-10 | 30 | same page |
| `pr-4-2026` | Public Ruling No. 4/2026: Special Allowances for Small Value Assets | `public_ruling` | LHDN | 2026-09-30 | 15 | same page |
| `sst-professional-services` | Service Tax Guide on Professional Services | `sst` | RMCD | 2021-09-21 | 41 | mysst.customs.gov.my → Industry Guides |
| `sst-management-services` | Service Tax Guide on Management Services (V5) | `sst` | RMCD | 2026-05-06 | 21 | same page |
| `sst-digital-services-fsp` | Service Tax Guide on Digital Services by Foreign Service Providers (V2) | `sst` | RMCD | 2021-02-01 | 41 | same page |

~445 pages, ~600k characters of text.

**Manifest** (`lib/rag/sources.ts`): one typed entry per row above: `slug`, `file`, `title`, `shortTitle` (e.g. "PR 8/2025", for compact citations), `docType`, `issuer`, `publishedOn`, `sourceUrl`. Typed TS rather than JSON so M3/M4 import it and a typo in a slug fails `typecheck`.

### 3.2 Schema changes (`db/schema.sql`, then `npm run db:reset` + `npm run seed`)

```sql
create table documents (
  id            bigint generated always as identity primary key,
  slug          text not null unique,          -- stable ID; M4 "expected source" uses it
  title         text not null,
  short_title   text not null,
  doc_type      text not null check (doc_type in ('public_ruling', 'e_invoice', 'sst')),
  issuer        text not null,                 -- 'LHDN' | 'RMCD'
  published_on  date,
  source_url    text not null,
  file_path     text not null,                 -- relative to public/, e.g. documents/pr-8-2025.pdf
  content_hash  text not null,
  page_count    int not null,
  ingested_at   timestamptz not null default now()
);
create index documents_doc_type_idx on documents (doc_type);

create table chunks (            -- unchanged from M0 except section/page notes
  ...
  page_start   int not null,     -- 1-based PDF page
  page_end     int not null,
  section      text,             -- nearest heading, e.g. "1.6 Exemptions from implementing e-Invoice"
  ...
);
```

`file_path` stops being the unique key (the slug is). Everything else in `chunks` stays as in M0 (HNSW cosine index, `vector(768)`).

### 3.3 Pipeline

```
lib/rag/sources.ts ─▶ for each document:
  read file ─▶ hash ─▶ unchanged? skip
  ─▶ pdf.ts: unpdf → text per page
  ─▶ clean: drop repeated header/footer lines, TOC pages
  ─▶ chunk.ts: paragraphs → headings → chunks {content, pageStart, pageEnd, section}
  ─▶ llm.embed(title + section + content, RETRIEVAL_DOCUMENT) in batches of ≤ 8k tokens, paced under the free-tier token limit
  ─▶ one transaction: upsert documents row, delete old chunks, insert new chunks
then: delete documents not in the manifest; print a summary table
```

**Cleaning** (seen in the spike):
- **Running headers/footers.** Every page of a Public Ruling starts with the title, ruling number, publication date and "Page N of M"; SST guides end with "All rights reserved © … Royal Malaysian Customs Department" and the guide name. Rule: normalise numbers in each line (`Page 2 of 26` → `page # of #`), and drop lines in the top 8 / bottom 3 lines of a page that appear on ≥ 50% of a document's pages, plus bare page numbers.
- **Table-of-contents pages.** Lines ending in dot leaders + a number (`2.3.1 Pre-Submission ........ 20`). Drop such lines; skip a page if most lines are like that, so TOC chunks don't win similarity searches for every heading.
- **Whitespace.** Join wrapped lines within a paragraph; keep paragraph breaks.

**Heading detection** _(changed during the build, see §7)_: headings are the entries of the document's own table of contents, found again in the body. Numbered entries match on number + the first 12 letters of the title (TOC and body wording differ slightly); unnumbered RMCD headings must match exactly, case included, over one or two lines. Top-level headings (`4.`, `1.0`, ALL CAPS, `Appendix`) are hard chunk boundaries; deeper ones start a new chunk only if the current one is half full. A document without a TOC gets no section labels.

**Chunk packing:** add paragraphs until the next would pass ~1,500 chars; start the next chunk with the last paragraph of the previous one if it's ≤ 500 chars (overlap). A single paragraph longer than the cap (flattened tables in the e-Invoice Specific Guideline) is split at sentence ends, then spaces. Tiny chunks (< 200 chars) merge into the previous chunk of the same section; heading-only chunks and scraps under 50 chars are dropped.

### 3.4 Code layout

```
lib/rag/
  sources.ts      manifest (typed), CHUNKER_VERSION
  pdf.ts          extractPages(file) → string[]  (unpdf); cleanPages(pages) → { lines, toc }
  chunk.ts        chunkDocument({ lines, toc }) → Chunk[]  (pure: no I/O, no API); embeddingText()
scripts/
  ingest.ts       npm run ingest [-- --dry-run | --force | --only <slug>]
public/documents/ the 9 PDFs
```

`package.json`: add `unpdf`; script `"ingest": "tsx --env-file-if-exists=.env scripts/ingest.ts"`.

**Output** (example):

```
slug                         pages  chunks  avg chars  status
pr-8-2025                       29      41       1180  ingested (2 embed calls, 3.1s)
einvoice-guideline              62      70       1240  unchanged, skipped
…
9 documents, 497 chunks, 21 embed calls
```

`/status` page: already lists `documents` / `chunks` row counts; adds "Knowledge base is empty. Load the tax documents with `npm run ingest`" when there are no chunks.

## 4. Tasks

- [x] Commit the 9 PDFs to `public/documents/` + `lib/rag/sources.ts` manifest
- [x] Schema changes (§3.2); `db:reset` + `seed`; update the ERD in ARCHITECTURE.md
- [x] `lib/rag/pdf.ts`: per-page extraction + header/footer/TOC cleaning
- [x] `lib/rag/chunk.ts`: paragraphs → headings → packed chunks with overlap and page ranges
- [x] `scripts/ingest.ts --dry-run`; review `tmp/chunks.jsonl` for every document, tune heading rules / size until spot-checks pass (§5)
- [x] Embedding in batches, paced under the free-tier token limit, retry on 429; observed limits recorded in §7
- [x] Idempotent writes: hash skip, per-document transaction, prune removed docs, `--force`, `--only`
- [x] `/status`: knowledge-base counts
- [x] README: ingest step (`npm run ingest`, what it costs, `--dry-run` without a key)
- [x] ARCHITECTURE.md §5: document set, parsing, cleaning, chunking, embedding, re-ingest (first half of the RAG design)
- [x] AI usage log entries

## 5. Exit criteria / how to verify

- [x] Fresh DB → `npm run ingest` fills 9 `documents` rows and all chunks; no chunk has an empty `content`, a null embedding, or `page_start > page_end`. _497 chunks, 0 bad rows (also checked `page_end ≤ page_count`); all vectors 768 dims, length 1.0000._
- [x] Second run: "9 unchanged", **zero** embed calls, finishes in a few seconds. _0.7 s._
- [x] Touch one manifest entry (or `--only pr-8-2025 --force`) → only that document is re-ingested; its chunk IDs change, others don't. _Ran `--only pr-4-2026 --force`: its IDs went 347–372 → 500–525; the other 8 documents' IDs were unchanged._
- [x] Removing a manifest entry deletes that document and its chunks. _Tested by inserting a `documents` row with a slug not in the manifest: the next run reported it "removed"._
- [x] `--dry-run` works with no `GEMINI_API_KEY` and no DB
- [x] **Spot-check 15 random chunks** (`order by random() limit 15`) against the PDFs: text is on the cited page(s), `section` is the right heading, no running headers/footers or TOC lines in `content`. _Done more strictly from the dry run: a script checked that every paragraph of all 497 chunks is on its cited pages (0 misses), plus regex scans for leftover headers/footers (0) and a section-list review per document._
- [x] Size distribution sane: no chunk over ~2× the cap; few under 200 chars. _Median 1,323, p10 607, max 1,691; 6 under 200 (whole short sections such as "17. Disclaimer")._
- [x] Sanity search in `psql` (not M3, just proof the vectors work): embed "Who is exempt from issuing e-Invoices?" and "Is service tax charged on legal services?"; the top 3 chunks come from `einvoice-guideline` §1.6 and `sst-professional-services` respectively. _Both pass, plus two more (results in §7)._
- [x] `lint` / `typecheck` / `build` pass

## 6. Risks & open questions

- **Heading detection is heuristic.** Each publisher formats differently (LHDN numbered headings vs RMCD title-case headings), and large tables in the e-Invoice Specific Guideline may chunk poorly. Mitigation: `--dry-run` review per document before embedding; `section` can be null without breaking anything (citations fall back to page only). _Resolved by using each document's TOC (§7)._
- **Free-tier embedding limits are unknown** (not published; M0). ~5 calls should be far below any limit, but a 429 mid-run must not leave a document half-written: hence embed first, then write in one transaction. _Turned out to matter: the limit is 30k tokens/minute, see §7._
- **Documents go out of date.** e-Invoice guidelines are revised every few months (v4.6 → v4.8 since search engines indexed it). The manifest records version + date, and M3 can show "as at <date>" in citations. A real system would re-check sources on a schedule (ARCHITECTURE.md §8).
- **Copyright / redistribution.** These are public government guidance documents, committed unmodified with their source URLs, for a non-commercial take-home. Note it in the README.
- **Bahasa Malaysia originals.** Public Rulings are "Translation from the original Bahasa Malaysia text"; we use the English versions only. Malay queries are out of scope (M4 can note it as a learning).
- **No `.env` in this workspace yet.** Copy it from the M0/M1 workspace before the embedding step; everything up to `--dry-run` works without it.

## 7. Notes & outcome (fill in at the end)

### Spike (2026-11-04, during planning)

- Scratch project in `.context/m2-spike/` (not committed): downloaded the 9 PDFs and ran `unpdf` 2.1.0 `extractText(pdf, { mergePages: false })`.
- All 9 parse; 0 pages with under 50 characters, so no scanned pages and no OCR needed. Harmless pdf.js font warnings (`TT: undefined function`) on the RMCD PDFs.
- Text comes out in reading order with line breaks; numbered headings (`1.6 Exemptions from implementing e-Invoice`) are on their own lines.
- Found: running headers glued to body text on some lines (`Date of Publication: 22 December 2025INLAND REVENUE BOARD OF MALAYSIA`), TOC pages with dot leaders, and a "Summary of changes" table at the front of each e-Invoice guideline.
- URL churn: search results pointed to `/media/...` and `mysst.customs.gov.my/assets/...` links that now 404 or serve an old version (e-Invoice Guideline v4.6). The official listing pages had v4.8 / v4.9. Supports committing the PDFs (D-b).

### Build (2026-11-04)

**What changed from the plan**
- **Headings come from each document's table of contents, not from patterns.** The first version guessed headings (numbered short lines, ALL CAPS, Title Case lines before a numbered paragraph). The dry run showed it turning numbered list items into sections ("1. API Application Programming Interface", "1. Address", "2. Business Details"), which cut the e-Invoice Guideline into 172 chunks averaging 388 chars. All 9 documents have a TOC, so the chunker now matches TOC entries in the body. That needed three refinements, each found in the dry-run output: numbered entries match on number + title prefix because TOC and body wording differ ("6. Allowable Deductions" vs "6. Allowable Deduction", "under the ITA" vs "under the Income Tax Act 1967 (ITA)"); unnumbered matches are case-sensitive ("taxable services" in a sentence vs the heading "TAXABLE SERVICES"); wrapped TOC entries are joined when the line has no page number yet or ends in a dangling word ("… EMPLOYEE ON"). The pattern heuristics were deleted rather than kept as a fallback that no document would exercise.
- **Header/footer cleaning needed two fixes:** PR 7/2025's running header is 7 lines (zone widened from 6 to 8), and RMCD footers glue the page number onto the copyright line, so pages 1–9 and 10+ normalised differently until digit runs (not single digits) were replaced.
- **"90 days after …" started a new paragraph.** A bare number at the start of a line isn't a paragraph marker; only `5.` or `5.1` style numbers are.
- **Chunk labels use the section where the chunk starts**, not the last heading inside it.
- **Hash covers the embedding model too**, so switching models in M4 re-embeds automatically.
- Dry-run output goes to `tmp/chunks.jsonl` (gitignored) rather than `.context/`, which is a Conductor folder a reviewer won't have.

**Verified without a key:** dry run on all 9 docs (497 chunks; 0 paragraphs off their cited pages; 0 leftover headers/footers or TOC lines); vector insert, cosine distance and cascade delete tested against the Docker DB with fake vectors (scratch script, not committed); a bad key fails in < 1 s with "Gemini API error 400: API key not valid" and leaves the DB untouched; `/status` shows the "Knowledge base is empty" hint; `/documents/pr-8-2025.pdf` is served; lint, typecheck, build.

### First real run (2026-11-04)

- **Free-tier embedding limit: 30,000 tokens per minute** (`embed_content_free_tier_tokens`, from the 429 message). The first run used 100-chunk batches: the e-Invoice Guideline (59 chunks, ~17k tokens) went through, then the next document's first batch (~30k+ tokens on its own) was rejected on every retry. Real token counts (`countTokens`): ~4.4 characters per token, so the whole set is ~150k tokens.
- Fix: batches of ≤ 8k estimated tokens, a rolling 24k tokens/minute budget, and on a 429 wait for the API's "retry in Ns". Full ingest: **6 min 9 s, 21 embed calls, one 429** (waited 7 s, then continued). Most documents take ~60 s because the budget is the bottleneck; a paid key would take seconds.
- Second run: 0.7 s, 0 calls. `--only pr-4-2026 --force`: 1 call, 1.7 s.

**Sanity searches** (question embedded with `RETRIEVAL_QUERY`, top 3 by cosine similarity):

| Question | Top 3 | Similarity |
|---|---|---|
| Who is exempt from issuing e-Invoices? | e-Invoice Guideline §1.6, p15 / p15–16 / p17 | 0.764 / 0.748 / 0.739 |
| Is service tax charged on legal services? | SST Professional Services: Registration p36–37, **Legal Services p5–6**, Registration p37 | 0.730 / 0.724 / 0.720 |
| What is the turnover threshold for an SME company to get the lower tax rate? | PR 8/2025 §6 p19–20, §4 p6, §6 p19 | 0.712 / 0.708 / 0.705 |
| Can I claim tax relief for my child's education fees? | PR 7/2025 §6 p53–54, p39–40, p53 | 0.705 / 0.696 / 0.695 |
| What is the capital of France? _(out of scope)_ | PR 7/2025 §7 | 0.504 |
| What is the corporate income tax rate in Singapore? _(out of scope, near domain)_ | PR 7/2025 §1 | 0.603 |

**Follow-ups for M3 / M4**
- Right document every time, but on the legal-services question the "Legal Services" section ranks 2nd behind a registration chunk. Worth a rerank or a top-k larger than 3, and a case for the M4 eval.
- In-scope top hits score ~0.70–0.76, a near-domain out-of-scope question 0.60. The gap is too narrow for a similarity threshold alone to decide "not in the documents": the prompt must handle refusals, with at most a low threshold (~0.55) as a cheap guard.
- Scores sit in a tight band, so showing similarity in the UI means little to a user; show citations instead.
