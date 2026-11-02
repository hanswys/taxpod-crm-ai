# M0 — Foundations & design

**Status:** In progress
**Dates:** 2026-11-03 → 2026-11-03
**Branch / PR:** `hanswys/lrfq7`

## 1. Goal

The design is committed before any feature code: ARCHITECTURE.md has a component diagram, the data model, and the stack justification (brief Part 3, "System Design", "Data Model", "Stack Choice"). A scaffolded Next.js app runs against a local Postgres + pgvector started from Docker Compose with the schema loaded, and a smoke script shows that the Gemini key, chat model and embedding model all work.

No CRM or RAG features yet. That starts in M1.

## 2. Decisions

D1–D4 and D8 are already decided in `PLAN.md` §5. These are the smaller decisions M0 needs:

| Decision | Choice | Why | Alternatives considered |
|---|---|---|---|
| Component diagram format | **Mermaid** in ARCHITECTURE.md (renders on GitHub) | Versioned with the code, diffable, no extra tool. The brief accepts any tool. | Excalidraw/draw.io PNG (nicer looking but drifts from the code); hand-drawn photo |
| Primary keys | `bigint generated always as identity` | Short, readable IDs in URLs and the demo. Nothing needs to be globally unique. | `uuid` via `gen_random_uuid()` |
| Enum columns | `text` + `CHECK (... IN (...))` | Maps directly to a TS union type and is easy to read in `schema.sql`. Changes go through a DB reset anyway. | Native Postgres `ENUM` types (awkward to alter) |
| Money | `numeric(12,2)`, column `value_rm` | Exact decimal. postgres.js returns it as a string, so parse it in one place. | `integer` sen (cents): exact, but needs formatting everywhere |
| `updated_at` | Set explicitly in each `UPDATE` statement | Only a few update queries; a trigger is more SQL to explain | Trigger function |
| Contact delete | **Decided (A):** hard delete with `ON DELETE CASCADE` to opportunities and activities. Confirm dialog states what goes with it, e.g. "also deletes 2 opportunities (RM 20,000) and 4 activities" | Simplest to build and explain; no orphans; keeps CRM time down so it goes to RAG | B: `RESTRICT` (blocks delete while opportunities exist; clunky in a demo). C: soft delete / archive with `archived_at` + `active_*` views + restore. **C is what real CRMs do** (recycle bin, plus a later hard purge for PDPA erasure); written up in ARCHITECTURE.md "What I would do differently" |
| Activity target | Nullable `contact_id` **and** nullable `opportunity_id`, `CHECK` at least one is set | Brief says "against a contact or opportunity". Two plain FKs are easier than a polymorphic `(target_type, target_id)`. | Polymorphic target; opportunity-only with contact derived |
| RAG tables in M0 schema | **Yes**, `documents` + `chunks` now, marked provisional | ARCHITECTURE.md data model must show the whole system. M2 can still change columns (reset is cheap). | Add them in M2 |
| Host DB port | **5433** → container 5432 | Avoids clashing with a reviewer's local Postgres on 5432 | 5432 |
| Package manager / runtime | npm, Node LTS pinned in `.nvmrc` + `engines` | Reviewer has npm already. Matches README steps in PLAN §3. | pnpm, bun |
| Repo layout | Single Next.js app at the repo root, no `src/` | One package, short paths. Scripts live in `scripts/`. | Monorepo with separate ingestion service |

## 3. Design

### 3.1 Component diagram (draft, goes into ARCHITECTURE.md)

```mermaid
flowchart LR
  subgraph Browser
    UI["Next.js React UI<br/>Leads · Opportunities (Kanban) · Dashboard<br/>Tax Q&A chat · Meeting Notes"]
  end

  subgraph Server["Next.js server (Node)"]
    API["Route handlers / server actions"]
    CRM["CRM queries (raw SQL)"]
    RAG["RAG service<br/>embed query → top-k search → prompt → answer + citations"]
    NOTES["Meeting Notes extractor<br/>(structured output, M5)"]
    LLM["lib/llm.ts<br/>Gemini client wrapper"]
  end

  subgraph Scripts["CLI scripts (tsx)"]
    INGEST["npm run ingest<br/>parse → chunk → embed → upsert"]
    EVAL["npm run eval<br/>hit rate @k"]
  end

  PDFS[("Tax documents<br/>PDF / HTML on disk")]
  DB[("PostgreSQL 17 + pgvector<br/>(Docker Compose)")]
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

### 3.2 Data model

```mermaid
erDiagram
  contacts ||--o{ opportunities : has
  contacts ||--o{ activities : "logged against"
  opportunities ||--o{ activities : "logged against"
  documents ||--o{ chunks : "split into"

  contacts {
    bigint id PK
    text name
    text email
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

`db/schema.sql` sketch (final version written in the tasks below):

```sql
create extension if not exists vector;

create table contacts (
  id          bigint generated always as identity primary key,
  name        text not null,
  email       text,
  phone       text,
  company     text,
  status      text not null default 'lead' check (status in ('lead','prospect','customer')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on contacts (status);

create table opportunities (
  id          bigint generated always as identity primary key,
  contact_id  bigint not null references contacts(id) on delete cascade,
  title       text not null,
  value_rm    numeric(12,2) not null default 0 check (value_rm >= 0),
  stage       text not null default 'new'
              check (stage in ('new','contacted','qualified','proposal','won','lost')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on opportunities (contact_id);
create index on opportunities (stage);

create table activities (
  id              bigint generated always as identity primary key,
  contact_id      bigint references contacts(id) on delete cascade,
  opportunity_id  bigint references opportunities(id) on delete cascade,
  type            text not null check (type in ('call','email','meeting','note')),
  occurred_at     timestamptz not null default now(),
  description     text not null,
  created_at      timestamptz not null default now(),
  check (contact_id is not null or opportunity_id is not null)
);
create index on activities (occurred_at desc);

-- RAG (provisional: M2 may change these)
create table documents (
  id            bigint generated always as identity primary key,
  title         text not null,
  doc_type      text not null,
  source_url    text,
  file_path     text not null unique,
  content_hash  text not null,          -- skip re-ingest when unchanged
  page_count    int,
  ingested_at   timestamptz not null default now()
);

create table chunks (
  id           bigint generated always as identity primary key,
  document_id  bigint not null references documents(id) on delete cascade,
  chunk_index  int not null,
  content      text not null,
  page_start   int,
  page_end     int,
  section      text,
  token_count  int,
  embedding    vector(768) not null,
  unique (document_id, chunk_index)
);
create index on chunks using hnsw (embedding vector_cosine_ops);
```

Dashboard metrics map onto this as: total contacts = `count(*) from contacts`; open opportunities = stage not in (`won`,`lost`); total value = `sum(value_rm)` (plus open pipeline value); recent activity = latest `activities` by `occurred_at`.

### 3.3 Repo layout

```
app/                    Next.js App Router (pages + route handlers)
  page.tsx              M0: health page (DB + pgvector check)
components/ui/          shadcn/ui components
lib/
  db.ts                 postgres.js client (global singleton, survives dev hot reload)
  env.ts                reads + validates env vars (fails fast with a clear message)
  llm.ts                Gemini wrapper: generate() + embed(). Every model call goes through here
db/
  schema.sql            mounted into /docker-entrypoint-initdb.d
scripts/
  check-gemini.ts       M0 smoke test: list models, 1 embed call, 1 generate call
docker-compose.yml      pgvector/pgvector:pg17, host port 5433, named volume
.env.example
ARCHITECTURE.md
README.md
docs/
```

### 3.4 Env vars (`.env.example`)

```
DATABASE_URL=postgres://crm:crm@localhost:5433/crm
GEMINI_API_KEY=            # https://aistudio.google.com/apikey (free, no card)
GEMINI_CHAT_MODEL=gemini-2.5-flash      # confirm in M0 (task below)
GEMINI_EMBED_MODEL=gemini-embedding-001
```

Embedding dims (768) are fixed in `schema.sql`, so they're a constant in `lib/llm.ts`, not an env var.

### 3.5 npm scripts

| Script | Does |
|---|---|
| `dev` / `build` / `start` / `lint` | Next.js defaults |
| `db:up` | `docker compose up -d` |
| `db:reset` | `docker compose down -v && docker compose up -d` (re-runs `schema.sql`) |
| `db:psql` | `docker compose exec db psql -U crm crm` |
| `check:gemini` | `tsx scripts/check-gemini.ts` |

`ingest`, `seed`, `eval` are added in later milestones.

## 4. Tasks

**Design (before code)**
- [x] Create `ARCHITECTURE.md` skeleton with all brief sections: Overview, Stack choice & justification, Component diagram, Data model, RAG design (stub → M2/M3), Option B design (stub → M5), Evaluation results (stub → M4), What I would do differently
- [x] Fill in the component diagram (§3.1), data model (§3.2) and stack justification (from PLAN §3, including alternatives considered)
- [x] Seed "What I would do differently" with the archive/soft-delete design (option C above): `archived_at`, `active_contacts` / `active_opportunities` views so filters can't be forgotten, restore UI, eventual hard purge for PDPA erasure
- [ ] Commit the design on its own, so git history shows design before code

**Scaffold**
- [x] `create-next-app` (TypeScript, App Router, Tailwind, ESLint, `@/*` alias, no `src/`)
- [x] `shadcn` init + a couple of base components (button, card)
- [x] `.nvmrc` + `engines` for Node LTS
- [x] Install `postgres`, `@google/genai`, `tsx`, `dotenv`

**Database**
- [x] `docker-compose.yml`: `pgvector/pgvector:pg17`, user/db `crm`, port 5433, named volume, `db/schema.sql` mounted into init dir, healthcheck (`pg_isready`)
- [x] Write `db/schema.sql` (§3.2)
- [x] `lib/db.ts` singleton client; `lib/env.ts`
- [x] Health page at `/`: shows DB connected, pgvector version, and row counts per table
- [x] npm scripts `db:up`, `db:reset`, `db:psql`

**Gemini**
- [ ] Get a free AI Studio key; put it in `.env` (gitignored) and add a placeholder to `.env.example`
- [ ] Confirm current model IDs (list models via the API) and record the chosen chat model
- [x] `lib/llm.ts` with `generate()` and `embed()` (passes `outputDimensionality: 768` and a task type)
- [x] `scripts/check-gemini.ts`: embed one string (assert length 768), generate one short reply, print latency
- [ ] Record free-tier rate limits (RPM / RPD / batch size for embeddings) in §7, since M2 ingestion has to respect them

**Housekeeping**
- [x] `.gitignore` covers `.env*` (except `.env.example`), `node_modules`, `.next`
- [x] Minimal README: prerequisites + the 4 setup commands (gets fleshed out in M6)
- [ ] Add M0 entries to `docs/ai-usage-log.md`

## 5. Exit criteria / how to verify

- [ ] From a clean checkout: `cp .env.example .env` (+ key) → `npm install` → `npm run db:up` → `npm run dev` → `/` shows "DB connected", the pgvector version, and 0 rows in all 5 tables
- [ ] `npm run db:reset` brings the DB back to an empty schema without errors
- [ ] `npm run check:gemini` prints a 768-dim embedding length and a generated reply
- [ ] `ARCHITECTURE.md` has the component diagram, data model and stack justification; it renders on GitHub
- [ ] `git grep` for the API key finds nothing; `.env` is untracked
- [x] `npm run lint` and `npm run build` pass

## 6. Risks & open questions

- **Gemini model churn / free-tier limits.** Model IDs and quotas change often. Keeping them in env vars plus `check:gemini` means a reviewer can see quickly if something has moved. The free tier may use prompts for training; that's fine for public tax docs and fake CRM data, but worth a line in ARCHITECTURE.md.
- **Embedding normalisation.** `gemini-embedding-001` only returns normalised vectors at the full 3072 dims. At 768 we should L2-normalise ourselves (or rely on cosine distance, which doesn't care). Decide in M2; `embed()` can normalise from day one.
- **Init scripts only run on an empty volume.** Editing `schema.sql` does nothing until `db:reset`. Document this in the README.
- **postgres.js `numeric` / `bigint` come back as strings.** Parse at the query boundary in M1 so the UI never sees strings for money.
- **Reviewer without Docker.** Accepted: Docker is the one stated prerequisite (PLAN §3).
- **Deferred to M1:** should the dashboard feed also show system events (contact created, stage changed), or only logged activities? Default: only `activities`. Doesn't affect the M0 schema unless we add an events table.

## 7. Notes & outcome (fill in at the end)

- Chosen chat model ID: _pending Gemini key_
- Free-tier limits observed: _pending Gemini key_
- Deviations from plan:
  - Versions are newer than expected: Next.js 16.4 (Cache Components on by default), postgres.js 4, `@google/genai` 2. Read their bundled docs first.
  - Cache Components: DB reads must sit inside `<Suspense>` and call `connection()`, otherwise Next tries to run them at build time.
  - postgres.js returns `count(*)` (bigint) and `numeric` as strings. Health page shows them as-is; M1 parses at the query boundary.
  - A refused Postgres connection is an `AggregateError` with an empty message (IPv6 + IPv4 attempts); the health page unwraps it.
  - `next build` needs a `.env` because `lib/db.ts` checks `DATABASE_URL` when it's first imported. Kept on purpose: README step 1 creates `.env`.
  - No `dotenv`: scripts use Node's `--env-file-if-exists=.env` (hence `engines: node >=22.9`).
  - shadcn now uses its own `cn` package instead of `clsx` + `tailwind-merge`.
  - Docker wasn't installed on the dev machine; installing Docker Desktop.
