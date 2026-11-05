-- Loaded by the Postgres container on first start (empty volume only).
-- To apply changes: npm run db:reset (drops all data).

create extension if not exists vector;

-- CRM ----------------------------------------------------------------------

-- "Leads" in the UI. One entity for leads, prospects and customers.
create table contacts (
  id          bigint generated always as identity primary key,
  name        text not null,
  email       text,
  phone       text,
  company     text,
  role        text,                   -- job title, e.g. "Finance Manager" (M5)
  status      text not null default 'lead'
              check (status in ('lead', 'prospect', 'customer')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index contacts_status_idx on contacts (status);
-- One contact per email (case-insensitive). M5 matches extracted people to contacts by email.
create unique index contacts_email_unique on contacts (lower(email)) where email is not null;

-- Deleting a contact deletes its opportunities (and their activities).
create table opportunities (
  id          bigint generated always as identity primary key,
  contact_id  bigint not null references contacts (id) on delete cascade,
  title       text not null,
  value_rm    numeric(12, 2) not null default 0 check (value_rm >= 0),
  stage       text not null default 'new'
              check (stage in ('new', 'contacted', 'qualified', 'proposal', 'won', 'lost')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index opportunities_contact_id_idx on opportunities (contact_id);
create index opportunities_stage_idx on opportunities (stage);

-- Logged against a contact, an opportunity, or both.
create table activities (
  id              bigint generated always as identity primary key,
  contact_id      bigint references contacts (id) on delete cascade,
  opportunity_id  bigint references opportunities (id) on delete cascade,
  type            text not null check (type in ('call', 'email', 'meeting', 'note')),
  occurred_at     timestamptz not null default now(),
  description     text not null,
  created_at      timestamptz not null default now(),
  check (contact_id is not null or opportunity_id is not null)
);
create index activities_occurred_at_idx on activities (occurred_at desc);
create index activities_contact_id_idx on activities (contact_id);
create index activities_opportunity_id_idx on activities (opportunity_id);

-- RAG ----------------------------------------------------------------------
-- Filled by npm run ingest from lib/rag/sources.ts. Never touched by npm run seed.

create table documents (
  id            bigint generated always as identity primary key,
  slug          text not null unique,  -- stable ID from the manifest; the M4 eval names expected sources by slug
  title         text not null,
  short_title   text not null,         -- compact citation label, e.g. "PR 8/2025"
  doc_type      text not null check (doc_type in ('public_ruling', 'e_invoice', 'sst')),
  issuer        text not null,         -- LHDN or RMCD
  published_on  date,
  source_url    text not null,
  file_path     text not null,         -- under public/, so citations can link to /documents/<file>#page=N
  content_hash  text not null,         -- file + manifest entry + chunker + embedding model; unchanged = skipped
  page_count    int not null,
  ingested_at   timestamptz not null default now()
);
create index documents_doc_type_idx on documents (doc_type);

create table chunks (
  id           bigint generated always as identity primary key,
  document_id  bigint not null references documents (id) on delete cascade,
  chunk_index  int not null,
  content      text not null,
  page_start   int not null,           -- 1-based PDF page (what a PDF viewer and #page=N use)
  page_end     int not null,
  section      text,                   -- nearest heading, e.g. "1.6 Exemptions from implementing e-Invoice"
  token_count  int not null,           -- estimate: characters / 4
  embedding    vector(768) not null,   -- must match EMBEDDING_DIMS in lib/llm.ts
  unique (document_id, chunk_index),
  check (page_start <= page_end)
);
create index chunks_embedding_idx on chunks using hnsw (embedding vector_cosine_ops);

-- One row per Tax Q&A question (M3): what was retrieved and what came back, so a bad
-- answer can be traced. Existing DB without this table: npm run db:psql, paste this block.
create table if not exists rag_queries (
  id                bigint generated always as identity primary key,
  question          text not null,
  doc_type          text,                     -- filter used; null = all documents
  chunk_ids         bigint[] not null,        -- retrieved, best first
  scores            real[] not null,          -- cosine similarity, same order
  outcome           text not null check (outcome in ('answer', 'not_found', 'error')),
  not_found_reason  text check (not_found_reason in ('low_similarity', 'model_declined', 'no_valid_citations')),
  answer            text,                     -- the model's raw answer, before citation clean-up
  model             text,                     -- which model answered (primary or fallback)
  latency_ms        int,
  error             text,
  created_at        timestamptz not null default now()
);
create index if not exists rag_queries_created_at_idx on rag_queries (created_at desc);

-- Meeting Notes (M5) -------------------------------------------------------
-- Existing DB without these: npm run db:psql, paste this block (keeps all data).

alter table contacts add column if not exists role text;

-- One row per extraction: what the model proposed, and what the user confirmed after
-- reviewing it, so a bad extraction can be traced and the human's edits are visible.
create table if not exists meeting_notes (
  id            bigint generated always as identity primary key,
  notes         text not null,
  meeting_at    timestamptz not null,
  extraction    jsonb,                   -- the model's reply as returned (null on error)
  model         text,
  latency_ms    int,
  error         text,
  confirmed     jsonb,                   -- the reviewed payload the user confirmed
  written       jsonb,                   -- ids created / updated / logged by the confirm
  confirmed_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists meeting_notes_created_at_idx on meeting_notes (created_at desc);
