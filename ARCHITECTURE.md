# Architecture

A lightweight CRM (Leads, Opportunities, Activity Log, Dashboard) plus a RAG Q&A module over Malaysian tax documents, and a Meeting Notes Extractor as the optional add-on (Option B).

> Status: design written in M0, before feature code. Sections marked _(M2)_, _(M3)_ etc. are filled in as those milestones land.

## 1. Overview

- **One Next.js app** holds the UI, the server-side API (route handlers / server actions) and the CLI scripts (ingest, eval).
- **One PostgreSQL database** with pgvector holds both the CRM data and the document chunks plus embeddings. It runs locally from Docker Compose.
- **One external service:** the Google Gemini API, used for both chat (Gemini Flash) and embeddings (`gemini-embedding-001`). Every model call goes through `lib/llm.ts`, so prompts and calls are easy to find.
- **No auth:** a single hardcoded user, as the brief allows.

## 2. Component diagram

```mermaid
flowchart LR
  subgraph Browser
    UI["Next.js React UI<br/>Leads · Opportunities (Kanban) · Dashboard<br/>Tax Q&A chat · Meeting Notes"]
  end

  subgraph Server["Next.js server (Node)"]
    API["Route handlers / server actions"]
    CRM["CRM queries (raw SQL)"]
    RAG["RAG service<br/>embed query → top-k search → prompt → answer + citations"]
    NOTES["Meeting Notes extractor<br/>(structured output)"]
    LLM["lib/llm.ts<br/>Gemini client wrapper"]
  end

  subgraph Scripts["CLI scripts (tsx)"]
    INGEST["npm run ingest<br/>parse → chunk → embed → upsert"]
    EVAL["npm run eval<br/>hit rate @k"]
  end

  PDFS[("Tax documents<br/>PDF / HTML on disk")]
  DB[("PostgreSQL + pgvector<br/>(Docker Compose)")]
  GEMINI["Google Gemini API<br/>Flash (chat) · gemini-embedding-001"]

  UI -- HTTP --> API
  API --> CRM --> DB
  API --> RAG
  API --> NOTES
  RAG -- vector search --> DB
  RAG --> LLM
  NOTES --> LLM
  NOTES --> CRM
  LLM -- HTTPS --> GEMINI
  PDFS --> INGEST
  INGEST --> LLM
  INGEST --> DB
  EVAL --> RAG
```

**Main flows**
- **CRM:** browser → route handler / server action → SQL → Postgres.
- **Ingestion (offline):** `npm run ingest` reads the documents on disk, splits them into chunks with page/section metadata, embeds them via Gemini, and upserts into `documents` + `chunks`.
- **Tax Q&A:** question → embed → top-k cosine search in pgvector → grounded prompt with numbered chunks → Gemini Flash → answer with citations, or "not in the documents".
- **Evaluation:** `npm run eval` runs a fixed question set through the same retrieval code and reports hit rate @k.
- **Meeting Notes:** pasted notes → Gemini with a JSON schema → user reviews and edits → confirm writes contacts and activities.

## 3. Stack choice

The brief's preferred stack, kept as local as possible. A reviewer needs Node, Docker and a free Gemini API key.

| Layer | Choice | Why |
|---|---|---|
| App | Next.js (App Router) + TypeScript, Tailwind + shadcn/ui | Brief's preferred stack. One app and one language for UI, API and scripts. |
| Database | PostgreSQL + pgvector in one Docker Compose service (`pgvector/pgvector` image) | The brief's preferred vector store. CRM data and vectors in one DB; Docker is the only extra prerequisite. |
| DB access | `postgres` (postgres.js) + raw SQL; schema in `db/schema.sql`, loaded on first container start | No ORM or migration tool. Vector search is raw SQL anyway, and plain SQL keeps the retrieval query easy to read. Schema changes: reset the DB volume. |
| LLM | Gemini Flash (`gemini-3.5-flash`, set by `GEMINI_CHAT_MODEL`) via `@google/genai` | Named in the brief, has a free tier with no card. Chosen in M0 by probing the models the key can use: the newer 3.7 / 3.8 Flash returned 503 "high demand" on every call that day; 3.5 was the fastest that answered. |
| Embeddings | `gemini-embedding-001`, output reduced to 768 dims | Same key as the LLM. pgvector's HNSW index supports up to 2,000 dims; the model's default is 3,072. |
| Ingestion | TypeScript script run with `tsx` | Same runtime as the app. _(M2: confirm PDF page extraction quality in Node; Python is the fallback.)_ |
| Deploy | None; a screen recording instead | Keeps everything local. |

**Gemini free tier, things to know**
- Google may use free-tier prompts to improve its products. Fine here: we only send public tax documents and made-up CRM data. A real deployment would use a paid tier.
- Model IDs change: `gemini-2.5-flash`, the planned default, was already closed to new users. Model names live in env vars, and `npm run check:gemini` lists what a key can use.
- The free tier is often overloaded (503 / 504). The SDK's default retries could leave one call hanging for minutes, so `lib/llm.ts` sets a 30s timeout and 3 attempts. _(M3: fall back to another model and show a clear error in the UI.)_

**Alternatives considered**
- **Local LLM via Ollama:** the brief lists API providers, reviewers would have to download several GB, and small local models follow citation and refusal instructions less reliably.
- **PGlite (Postgres in WASM):** one process per data directory, so the ingest script and the dev server would fight over the DB.
- **SQLite + sqlite-vec:** works, but moves away from the preferred pgvector for no real gain.
- **Supabase CLI locally:** runs about 10 containers when we only need Postgres.
- **ORM (Drizzle / Prisma):** adds a layer and a migration tool for five tables; the vector query would be raw SQL regardless.

## 4. Data model

```mermaid
erDiagram
  contacts ||--o{ opportunities : has
  contacts |o--o{ activities : "logged against"
  opportunities |o--o{ activities : "logged against"
  documents ||--o{ chunks : "split into"

  contacts {
    bigint id PK
    text name
    text email UK "case-insensitive"
    text phone
    text company
    text status "lead | prospect | customer"
    timestamptz created_at
    timestamptz updated_at
  }
  opportunities {
    bigint id PK
    bigint contact_id FK
    text title
    numeric value_rm
    text stage "new | contacted | qualified | proposal | won | lost"
    timestamptz created_at
    timestamptz updated_at
  }
  activities {
    bigint id PK
    bigint contact_id FK "nullable"
    bigint opportunity_id FK "nullable"
    text type "call | email | meeting | note"
    timestamptz occurred_at
    text description
    timestamptz created_at
  }
  documents {
    bigint id PK
    text title
    text doc_type "public_ruling | e_invoice | sst | ..."
    text source_url
    text file_path
    text content_hash
    int page_count
    timestamptz ingested_at
  }
  chunks {
    bigint id PK
    bigint document_id FK
    int chunk_index
    text content
    int page_start
    int page_end
    text section
    int token_count
    vector embedding "768 dims"
  }
```

Full DDL: [`db/schema.sql`](db/schema.sql).

**Design notes**
- **One `contacts` table for "Leads".** The brief's Leads have a status of Lead / Prospect / Customer, while the dashboard counts "total contacts" and opportunities link to "contacts". So it's one entity with a `status`; the UI calls the page "Leads".
- **Enums as `text` + `CHECK`.** Maps directly onto TypeScript union types and is easy to read in the DDL.
- **Money as `numeric(12,2)` in `value_rm`.** Exact decimals, no floating-point rounding.
- **Activities link to a contact, an opportunity, or both.** Two nullable foreign keys with a `CHECK` that at least one is set; simpler to query than a polymorphic `(target_type, target_id)` pair.
  Activities logged from an opportunity's page also store that opportunity's contact, so a contact's timeline includes them without extra joins.
- **One contact per email.** A unique index on `lower(email)` (where email is set). The form shows a clear error for duplicates, and the Meeting Notes Extractor (M5) can match people to existing contacts by email.
- **Deleting a contact deletes its opportunities and activities** (`ON DELETE CASCADE`). The UI confirms first and says what else will be deleted. See §8 for the more realistic alternative.
- **Dashboard metrics:** total contacts = all `contacts` rows; open opportunities = stage not in (`won`, `lost`); total value = sum of `value_rm` across all stages (open pipeline and won value shown as sub-lines); recent activity = latest 10 `activities` by `occurred_at`. The feed shows only logged activities, not system events like "stage changed", so it stays meaningful.
- **RAG tables:** `documents` stores one row per source file with a content hash so re-ingesting unchanged files is skipped. `chunks` keeps page range and section heading for citations, and an HNSW index with cosine distance on `embedding`. _(M2 may refine these columns.)_

### CRM implementation (M1)

- **Reads:** server components call plain query functions in `lib/crm/*.ts` (raw SQL via postgres.js). Nothing is cached: CRM data is small and must be fresh after every edit. Each route has a `loading.tsx` so navigation shows a skeleton straight away while the query runs.
- **Writes:** Server Actions (`app/**/actions.ts`) validate `FormData` with zod schemas from `lib/crm/schemas.ts`, call the query function, then `refresh()` so the page re-renders in the same round trip. Validation errors come back as field errors through `useActionState`. The same schemas will validate the LLM's output in M5.
- **Numbers:** postgres.js returns `bigint` and `numeric` as strings; `lib/db.ts` parses both to numbers once at the driver level, so no query can forget.
- **Kanban:** native HTML5 drag-and-drop with `useOptimistic`, so the card moves at once and snaps back if the save fails. Keyboard and touch users change the stage from a dropdown on the opportunity's page.
- **Time zone:** all dates are shown and entered in Malaysia time (`Asia/Kuala_Lumpur`), whatever the server's or the browser's zone.

## 5. RAG design _(M2–M3)_

To be written as the module is built. Will cover: document set and sources, parsing, chunking strategy and size, embedding model and task types, vector index, retrieval settings (top-k, metadata filter / rerank), prompt design, citation format, hallucination guard ("not in the documents"), and error handling.

## 6. Meeting Notes Extractor design _(M5)_

To be written in M5. Will cover: extraction schema, prompt, schema enforcement and validation, the review-and-edit step, how contacts are matched (create vs update), and error handling.

## 7. Evaluation _(M4)_

To be written in M4: the question set with expected source documents, hit rate @k, and what we learned.

## 8. What I would do differently with more time

- **Archive contacts instead of deleting them.** Real CRMs (HubSpot, Salesforce) move deleted records to a recycle bin so sales history can be restored. Here, deleting a contact permanently deletes its opportunities and activities, which keeps the build simple. With more time:
  - add `archived_at timestamptz` to `contacts` and archive instead of delete;
  - read all CRM data through `active_contacts` / `active_opportunities` views, so no query can forget to hide archived rows (including the dashboard totals and the Kanban board, where an archived contact's opportunities shouldn't count);
  - an "Archived" filter with a Restore button;
  - a real permanent delete for erasure requests under Malaysia's PDPA, since archiving alone doesn't remove personal data.
- **Pagination and sorting on the leads list.** The list is capped at 200 rows (fine for the demo's 15). A real list needs keyset pagination and sortable columns, and search would move to Postgres full-text or trigram indexes once `ILIKE` gets slow.
- **Accessible drag-and-drop.** Native HTML5 drag-and-drop has no keyboard or touch support; the stage dropdown covers it, but a library like `@dnd-kit` would make the board itself accessible and allow reordering within a column.
- **An events table for the activity feed.** Stage changes and edits aren't recorded anywhere. An append-only `events` table would give an audit trail and a richer feed without mixing system events into the activities that people log.
