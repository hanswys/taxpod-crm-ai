# taxPOD CRM + AI

A lightweight CRM (Leads, Opportunities, Dashboard, Activity Log) with a RAG Q&A module over Malaysian tax documents. Design: [ARCHITECTURE.md](ARCHITECTURE.md).

> Work in progress. Full instructions (ingestion, RAG, Meeting Notes) are added as features land.

## Prerequisites

- Node.js 22.9+ (`.nvmrc` pins the current LTS)
- Docker (for Postgres + pgvector)
- A free Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey) (no card needed)

## Setup

```bash
cp .env.example .env        # then set GEMINI_API_KEY
npm install
npm run db:up               # Postgres + pgvector on localhost:5433, schema loaded
npm run seed                # optional: demo contacts, opportunities and activities
npm run ingest              # load the tax documents into the knowledge base (needs GEMINI_API_KEY)
npm run dev                 # http://localhost:3000
```

If port 5433 is taken, set `DB_PORT` in `.env` and use the same port in `DATABASE_URL`.

## Using the CRM

- **Dashboard** (`/`): total contacts, open opportunities, total value (RM) and the latest activity.
- **Leads** (`/leads`): search by name, email, company or phone; filter by status; create, edit and delete. A lead's page shows their opportunities and activity timeline, where you can log calls, emails, meetings and notes.
- **Opportunities** (`/opportunities`): a Kanban board by stage. Drag a card to change its stage, or use the stage dropdown on the opportunity's page.

`npm run seed` replaces all CRM data (it never touches ingested documents). [System status](http://localhost:3000/status) shows whether the app can reach the database. `npm run check:gemini` checks your API key, lists the models it can use, and makes one embedding and one chat call.

## Knowledge base (tax documents)

The RAG module answers from 9 public Malaysian tax documents, committed in [`public/documents/`](public/documents) and listed with their source URLs and publication dates in [`lib/rag/sources.ts`](lib/rag/sources.ts):

- **e-Invoice:** LHDN e-Invoice Guideline v4.8 and e-Invoice Specific Guideline v4.9
- **Public Rulings:** PR 8/2025 (micro, small and medium companies), PR 7/2025 (individual gifts and deductions), PR 3/2024 (tax borne by employers), PR 4/2026 (small value assets)
- **SST:** RMCD Service Tax guides on professional services, management services, and digital services by foreign service providers

They are unmodified copies of public government guidance, kept in the repo because the official URLs move often.

```bash
npm run ingest                      # parse → chunk → embed → store; skips unchanged documents
npm run ingest -- --dry-run         # parse and chunk only, no API key or DB needed; writes tmp/chunks.jsonl
npm run ingest -- --only pr-8-2025  # one document (add --force to re-embed it even if unchanged)
```

A full ingest embeds ~500 chunks and takes about 6 minutes on a free Gemini key, which allows 30,000 embedding tokens per minute; the script paces itself to stay under that. Running it again takes under a second: documents whose file, manifest entry, chunking settings and embedding model haven't changed are skipped. How the pipeline works: [ARCHITECTURE.md §5](ARCHITECTURE.md#5-rag-design).

## Database

The schema lives in [`db/schema.sql`](db/schema.sql) and is loaded only when the container starts with an empty volume. After changing it:

```bash
npm run db:reset            # drops all data and reloads the schema; then npm run seed and npm run ingest again
```

`npm run db:psql` opens a psql shell.
