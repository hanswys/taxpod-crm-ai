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

-- RAG (provisional: M2 may change these) -----------------------------------

create table documents (
  id            bigint generated always as identity primary key,
  title         text not null,
  doc_type      text not null,
  source_url    text,
  file_path     text not null unique,
  content_hash  text not null,  -- re-ingest is skipped when unchanged
  page_count    int,
  ingested_at   timestamptz not null default now()
);

create table chunks (
  id           bigint generated always as identity primary key,
  document_id  bigint not null references documents (id) on delete cascade,
  chunk_index  int not null,
  content      text not null,
  page_start   int,
  page_end     int,
  section      text,
  token_count  int,
  embedding    vector(768) not null,  -- must match EMBEDDING_DIMS in lib/llm.ts
  unique (document_id, chunk_index)
);
create index chunks_embedding_idx on chunks using hnsw (embedding vector_cosine_ops);
