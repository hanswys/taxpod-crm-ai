# taxPOD CRM + AI

A lightweight CRM (Leads, Opportunities, Dashboard, Activity Log) with a RAG Q&A module over Malaysian tax documents, and a Meeting Notes Extractor that turns pasted notes into reviewed CRM records. Design: [ARCHITECTURE.md](ARCHITECTURE.md).

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

## Tax Q&A (RAG)

Open **Tax Q&A** (`/ask`) and type a question, e.g. "Who is exempt from issuing e-Invoices?". Optionally limit the search to e-Invoice, Public Ruling or SST documents. The answer is written only from the passages found in the documents, with a numbered citation after each statement; click a citation to open the PDF on that page. "Show retrieved passages" lists the 10 passages sent to the model, with similarity scores. If the documents don't cover the question (try "What is the corporate income tax rate in Singapore?"), it says so instead of answering.

The same pipeline runs from the terminal:

```bash
npm run ask -- "Is service tax charged on legal services?"
npm run ask -- "Who is exempt from issuing e-Invoices?" --type sst   # filter: e_invoice | public_ruling | sst
```

Every question is logged to the `rag_queries` table (retrieved chunks, scores, outcome, model, latency). The free Gemini tier allows **5 answers a minute and 20 a day** on `gemini-3.5-flash`, and often returns "high demand" errors. When the chat model is busy, rate-limited or out of quota, the app tries `GEMINI_FALLBACK_MODEL` (`gemini-3.1-flash-lite`, separate quota) once, then tells you when to retry. Design: [ARCHITECTURE.md §5.5–5.8](ARCHITECTURE.md#55-retrieval-librag-retrievets).

## Meeting Notes (add-on)

Open **Meeting Notes** (`/notes`), paste notes from a meeting or call (or click one of the samples), set the meeting date and time, and click **Extract**. Gemini drafts:

- **People**, each matched to an existing contact by email, or suggested by name and company, or offered as a new lead. taxPOD staff are recognised and not added as contacts.
- **Opportunities**: create a new one, or link to the contact's open deal and optionally move its stage.
- **Action items** with owner and due date ("next Friday" is worked out from the meeting date).
- A **summary** of the meeting.

Every item shows the quote it came from in the notes. Emails or phone numbers that aren't in the notes are removed, and quotes that can't be found are flagged. Edit anything, choose create / update / link / skip per row, then **Confirm and save**: the contacts, opportunities and activities are written in one go (all or nothing) and appear on the lead pages, the Kanban board and the dashboard feed. Nothing is written before you confirm.

Extraction runs on `GEMINI_NOTES_MODEL` (`gemini-3.1-flash-lite`, about 3 s, separate quota from Tax Q&A) and falls back to `GEMINI_CHAT_MODEL`. Each extraction is logged to the `meeting_notes` table with what you confirmed. Design: [ARCHITECTURE.md §6](ARCHITECTURE.md#6-meeting-notes-extractor-design-m5).

## Evaluation

`npm run eval` runs 13 test questions ([`eval/questions.json`](eval/questions.json): 10 the documents answer, 3 they don't) through the same pipeline as the UI and reports the retrieval hit rate: how often a passage from the expected document, and from the expected pages, is in the top 1, 3, 6 and 10.

```bash
npm run eval                          # retrieval only: needs embeddings, no answer quota (a few seconds)
npm run eval -- --answers             # also generates every answer and checks it (13 Gemini calls, ~3 min)
npm run eval -- --mode hybrid         # experiments: hybrid (vector + full text) or rerank (LLM reorders the top 20)
npm run eval -- --only q07,q10        # a subset; prints only, doesn't overwrite the results files
```

Results are written to [`eval/results/`](eval/results); current numbers and what they showed are in [ARCHITECTURE.md §7](ARCHITECTURE.md#7-evaluation). Retrieval: **9/10 right document first, 10/10 in the 10 passages the model reads**. Answers: 10/10 cited the expected document and 3/3 out-of-scope questions were refused.

**Meeting Notes:** `npm run eval:notes` runs the 4 samples in [`eval/notes.json`](eval/notes.json) through the extractor and reports found / missed / extra items and field accuracy (4 Flash-Lite calls). Latest: all 8 people, 11 action items and 4 opportunities found with every checked field correct, no invented items ([`eval/results/notes.md`](eval/results/notes.md)).

**Gemini free-tier limits.** The answer run uses 13 of the 20 daily `gemini-3.5-flash` requests. The limit is per Google Cloud project and model, and resets at midnight Pacific time; a 429 "per day" error means it's used up. To avoid running out during testing, set `GEMINI_CHAT_MODEL=gemini-3.5-flash-lite` (its own quota) in `.env`, or use a key from a project with billing enabled.

## Database

The schema lives in [`db/schema.sql`](db/schema.sql) and is loaded only when the container starts with an empty volume. After changing it:

```bash
npm run db:reset            # drops all data and reloads the schema; then npm run seed and npm run ingest again
```

`npm run db:psql` opens a psql shell.

**Database created before M3?** It lacks the `rag_queries` table. Instead of a reset (which would mean re-ingesting), run `npm run db:psql` and paste the `create table if not exists rag_queries …` block from the end of `db/schema.sql`.

**Database created before M5?** It lacks `contacts.role` and the `meeting_notes` table. Run `npm run db:psql` and paste the block under "Meeting Notes (M5)" at the end of `db/schema.sql` (it keeps all data).
