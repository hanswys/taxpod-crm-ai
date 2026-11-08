# Project Plan — taxPOD CRM + AI (RAG)

High-level plan only. Each milestone gets its own detailed plan in `docs/milestones/MX-*.md`, written **when that milestone starts** (using `docs/milestones/_TEMPLATE.md`), not up front.

- Brief: `docs/BRIEF.md`, kept locally only (removed from the repo in M6 so the case study isn't published)
- Timeline: brief received **Tue 2026-11-03** → submit by **Tue 2026-11-10** (7 calendar days, confirmed)

---

## 1. What we're being judged on

Read from the brief, in priority order:

1. **RAG module** — "what we will assess most closely". Real embeddings, real LLM, visible prompts, citations, refuses when the answer isn't in context, **evaluation with hit rate**.
2. **How we think / design** — ARCHITECTURE.md written *before* code: component diagram, data model, RAG design, candid "what I'd do differently".
3. **How we use AI tools** — AI_USAGE.md with a real prompt → output → what changed → why. Needs real material captured as we go.
4. **Core CRM works** — Leads, Opportunities (Kanban), Dashboard. Expected to be solid, not fancy.
5. **Runs locally from README** — `.env.example`, ingestion steps, no committed keys. Deployed link / 3–5 min recording strongly encouraged.
6. Optional add-on (one of A/B/C) — nice to have, only after the above is solid.

Implication: CRM should be built fast and plainly; time saved goes into RAG quality and evaluation.

## 2. Requirement interpretations

| Brief says | Our interpretation |
|---|---|
| "Leads" with status Lead / Prospect / Customer; dashboard counts "total contacts"; opportunities "associate with contacts" | One `contacts` entity with a `status` field. UI calls the page "Leads". Dashboard "total contacts" = all rows. |
| Opportunity stage New → Contacted → Qualified → Proposal → Won / Lost | Enum. "Open opportunities" = stage not in (Won, Lost). "Total opportunities value" = sum of all (also show open pipeline value). |
| Recent activity feed on dashboard | Backed by the Activity Log table, so we build Activity Log even though it's optional. |
| Auth not required | Single hardcoded user; no login. |
| ≥5 public Malaysian tax docs | Aim for 6–8 across types (Public Rulings, e-Invoice guidelines, SST guides) so metadata filtering is meaningful. |
| Citations: document name + page/section | Preserve page numbers (PDF) / section headings through chunking. |

## 3. Stack (simplified, local-first)

Goal: a reviewer needs **Node, Docker, and a free Gemini API key**, nothing else. Setup is `docker compose up -d` → `npm install` → `npm run ingest` → `npm run dev`.

| Layer | Choice | Why |
|---|---|---|
| App | Next.js (App Router) + TypeScript, Tailwind + shadcn/ui | Brief's preferred stack. One app holds the UI, API routes and scripts (run with `tsx`), so there's one language and one process. |
| DB | PostgreSQL + pgvector, **one Docker Compose service** (`pgvector/pgvector` image) | Exactly the brief's preferred vector store. CRM data and vectors live in one DB, and the only extra prerequisite is Docker. |
| DB access | `postgres` (postgres.js) driver + **raw SQL**; schema in `db/schema.sql`, loaded on first container start | No ORM and no migration tool. Vector search is raw SQL anyway, and plain SQL makes the retrieval query easy to show reviewers. To change the schema, reset with `docker compose down -v`. |
| LLM | **Gemini Flash** (free tier) via `@google/genai` | Listed in the brief and free. The only non-local piece. |
| Embeddings | **`gemini-embedding-001`**, output dims set to 768 | Same key as the LLM. pgvector HNSW indexes only go up to 2000 dims, and the model's default is 3072. |
| Ingestion | TypeScript script (`npm run ingest`) | Same runtime as the app. Python is a fallback only if PDF page extraction in Node proves poor (checked in M2). |
| Deploy | **None.** Submit a 3–5 min screen recording instead | Keeps everything local. Can revisit in M6: hosted Supabase is plain Postgres, so `schema.sql` would carry over. |

Verify the exact Gemini model IDs and free-tier rate limits in M0.

**Alternatives considered**
- **Fully local LLM via Ollama.** Rejected as the default. The brief lists API providers (Claude/OpenAI/Gemini/DeepSeek), so a local model risks failing "use a real LLM API". It also makes reviewers download several GB of models, and small local models follow citation and refusal instructions less reliably. Could be added later behind the same `llm.ts` interface. Not planned.
- **PGlite (Postgres + pgvector in WASM, no Docker).** Rejected. It allows only one process per data directory, so `npm run ingest` and `npm run dev` would fight over the DB, and it's less representative of production.
- **SQLite + sqlite-vec.** Rejected. It would work, but it moves away from the preferred pgvector and would need justifying for no real gain.
- **Supabase CLI locally.** Rejected. It runs about 10 containers; we only need Postgres.

## 4. Milestones

| # | Milestone | Scope (high level) | Exit criteria | Target |
|---|---|---|---|---|
| **M0** | Foundations & design | Lock in stack + providers; component diagram; data model; ARCHITECTURE.md skeleton (design first, per brief); repo scaffold, DB in Docker, migrations, `.env.example`; start AI usage log | `npm run dev` serves a page against a migrated DB; diagram + data model committed | 11-03 |
| **M1** | Core CRM | Leads CRUD + search + status filter; Opportunities CRUD linked to contacts + Kanban grouped by stage; Activity Log; Dashboard (counts, RM totals, recent activity) | All CRUD flows work end to end with seed data | 11-04 → 11-05 |
| **M2** | RAG: knowledge base & ingestion | Pick and download ≥5 docs; parse (with pages/sections); chunking strategy; embed; store in pgvector with metadata; idempotent ingest command | `npm run ingest` fills `documents` + `chunks`; spot-check chunks + page refs | 11-05 → 11-06 |
| **M3** | RAG: retrieval, answering & UI | Top-k similarity search; metadata filter and/or rerank (bonus); grounded prompt; citations; "not in context" refusal; error handling; chat UI | Ask a question in the UI → cited answer; out-of-scope question → refusal | 11-06 → 11-07 |
| **M4** | RAG: evaluation | 8–10 questions with expected source doc (+ a couple of negatives); eval script; hit rate @k; tuning; write up learnings | Reproducible `npm run eval` + results table in ARCHITECTURE.md | 11-07 |
| **M5** | Optional add-on: Meeting Notes Extractor (Option B) | Paste notes → LLM extracts contacts, action items, opportunity info (schema-enforced) → user reviews/edits → confirm creates/updates contacts and logs activities | Feature works with human review step; design documented | 11-08 |
| **M6** | Docs, polish & submission | Final README, ARCHITECTURE.md, AI_USAGE.md; screen recording; clean-clone test ([plan](milestones/M6-submission.md)) | Fresh clone runs from README alone; submission email sent | 11-05 → 11-07 (deadline 11-10) |

**Cut line if behind:** drop M5 first. Never cut M4 (evaluation) — it's explicitly assessed. Rerank/metadata filter in M3 is a bonus and can shrink to a single metadata filter.

## 5. Open decisions

Decide these in the milestone listed; record the outcome + reason in that milestone's doc and in ARCHITECTURE.md.

| # | Decision | Options | Leaning | When |
|---|---|---|---|---|
| D1 | LLM provider | Gemini free tier / Ollama | **Decided: Gemini Flash** (see §3) | ✅ 11-03 |
| D2 | Embedding model | Gemini / Ollama `nomic-embed-text` | **Decided: `gemini-embedding-001` @ 768 dims** | ✅ 11-03 |
| D3 | Local DB | Docker pgvector / PGlite / SQLite / Supabase CLI | **Decided: Docker Compose `pgvector/pgvector`** | ✅ 11-03 |
| D4 | DB access | Drizzle / Prisma / raw SQL | **Decided: raw SQL + postgres.js** | ✅ 11-03 |
| D5 | Ingestion language | TypeScript vs Python | **Decided: TypeScript + `unpdf`** (tested on all 9 docs: text layer on every page, per-page output) | ✅ 11-04 |
| D6 | Chunking | Fixed-size vs heading/section-aware | **Decided: section-aware**, ~1,500-char cap, 1-paragraph overlap; tuned in M4 | ✅ 11-04 |
| D7 | Rerank vs metadata filter | LLM rerank, cross-encoder, doc-type filter | **Decided: `doc_type` filter** in M3; LLM rerank tried in M4 and kept only if it lifts hit rate | ✅ 11-04 |
| D8 | Optional add-on | A Copilot / B Meeting Notes / C Open | **Decided: B, Meeting Notes Extractor.** Reuses the Activity Log; shows schema-enforced structured output plus human-in-the-loop, which RAG doesn't cover | ✅ 11-03 |
| D9 | Deploy target | none / Vercel + Supabase | **Decided: none, recording only.** No login + a 20/day free key make a public copy fragile (anyone can edit data, quota runs out); see M6 D-a | ✅ 11-05 |

## 6. Working agreements

- **Plan per milestone.** At the start of each milestone, copy `_TEMPLATE.md` → `MX-<slug>.md` and fill it in before coding.
- **Capture AI usage as we go** in `docs/ai-usage-log.md` (prompt, output, what changed, why). AI_USAGE.md in M6 is distilled from it; it can't be reconstructed afterwards.
- **Design before code.** ARCHITECTURE.md diagram + data model land in M0 before feature code (the brief asks for this explicitly).
- **No secrets in git.** `.env.example` only.
- One branch / PR per milestone (or sub-part), merged to `main` before the next one depends on it.

## 7. Deliverables checklist

- [x] Repo runs locally from README (incl. ingestion): fresh-clone test 11-05
- [x] `.env.example`, no real keys committed (full history scanned 11-05)
- [x] README.md — setup, ingest, how to use RAG + add-on
- [x] ARCHITECTURE.md — component diagram, data model, RAG design, add-on design, eval results, "what I'd do differently"
- [x] AI_USAGE.md — tools, one real prompt/output/change/why, where AI helped / fell short
- [x] 3–5 min recording ([Loom](https://www.loom.com/share/4b3ac71c44b649f1a989a386d0469904)) (script: [`docs/demo-script.md`](demo-script.md))
- [ ] Email HR: subject `[Full Name] — CRM Assessment Submission`
