# taxPOD CRM + AI

A lightweight CRM (Leads, Opportunities, Dashboard, Activity Log) with a **RAG Q&A module over Malaysian tax documents**, and a **Meeting Notes Extractor** (Option B) that turns pasted notes into CRM records after a human review.

- **Demo video (about 4 minutes):** _link added after recording_
- **Design, RAG details and evaluation:** [ARCHITECTURE.md](ARCHITECTURE.md)
- **How AI tools were used:** [AI_USAGE.md](AI_USAGE.md)

## Quick start

You need:

- **Node.js 22.9+** (`.nvmrc` pins the current LTS: `nvm use`)
- **Docker** (runs Postgres with pgvector)
- **A free Gemini API key** from [Google AI Studio](https://aistudio.google.com/apikey) (no card needed)

```bash
git clone https://github.com/hanswys/taxpod-crm-ai.git && cd taxpod-crm-ai
cp .env.example .env        # then paste your key into GEMINI_API_KEY
npm install
npm run db:up               # Postgres + pgvector on localhost:5433, schema loaded
npm run check:gemini        # optional: checks the key and the model names (2 small calls)
npm run seed                # demo contacts, opportunities and activities
npm run ingest              # loads the 9 tax documents into the knowledge base (~6 min on a free key)
npm run dev                 # http://localhost:3000
```

Port 5433 taken? Set `DB_PORT` in `.env` and use the same port in `DATABASE_URL`.

`npm run ingest` ends with a table of the 9 documents and their chunk counts (497 in total). The free Gemini tier allows 30,000 embedding tokens a minute, so the script paces itself; with a paid key it takes seconds. Running it again takes under a second because unchanged documents are skipped.

For a production build: `npm run build && npm start`.

## Using the CRM

- **Dashboard** (`/`): total contacts, open opportunities, total value (RM) and the latest activity.
- **Leads** (`/leads`): search by name, email, company or phone; filter by status (Lead / Prospect / Customer); create, edit and delete. A lead's page shows their opportunities and activity timeline, where you can log calls, emails, meetings and notes.
- **Opportunities** (`/opportunities`): a Kanban board by stage. Drag a card to change its stage, or use the stage dropdown on the opportunity's page.

`npm run seed` replaces all CRM data; it never touches the ingested documents. [System status](http://localhost:3000/status) shows the database connection, row counts and the models in use.

## Tax Q&A (RAG)

Open **Tax Q&A** (`/ask`) and type a question, or click one of the examples. For instance:

- "Who is exempt from issuing e-Invoices?"
- "What is the current service tax rate on legal services?"
- "What is the corporate income tax rate in Singapore?" (not covered by the documents, so it says so instead of answering)

Optionally limit the search to e-Invoice, Public Ruling or SST documents. The answer is written only from the passages found, with a numbered citation after each statement; click a citation to open the PDF on that page. "Show retrieved passages" lists the 10 passages the model read, with similarity scores and which ones were cited.

The same pipeline runs from the terminal:

```bash
npm run ask -- "Is service tax charged on legal services?"
npm run ask -- "Who is exempt from issuing e-Invoices?" --type e_invoice   # filter: e_invoice | public_ruling | sst
```

**How it works:** the question is embedded with `gemini-embedding-001` → top-10 cosine search in pgvector (with the optional `doc_type` filter) → if nothing is close enough, it stops there → otherwise Gemini Flash answers from the numbered passages under a JSON schema → the server keeps only citations that point at passages it sent, and withholds answers with none. Every question is logged to the `rag_queries` table. Code: [`lib/rag/`](lib/rag). Design: [ARCHITECTURE.md §5](ARCHITECTURE.md#5-rag-design).

### The knowledge base

9 public Malaysian tax documents, committed in [`public/documents/`](public/documents) and listed with their source URLs and publication dates in [`lib/rag/sources.ts`](lib/rag/sources.ts):

- **e-Invoice (LHDN):** e-Invoice Guideline v4.8 and e-Invoice Specific Guideline v4.9
- **Public Rulings (LHDN):** PR 8/2025 (micro, small and medium companies), PR 7/2025 (individual gifts and deductions), PR 3/2024 (tax borne by employers), PR 4/2026 (small value assets)
- **SST (RMCD):** Service Tax guides on professional services, management services, and digital services by foreign service providers

They are unmodified copies of public government guidance, kept in the repo because the official URLs move often.

```bash
npm run ingest -- --dry-run         # parse and chunk only, no key or DB needed; writes tmp/chunks.jsonl
npm run ingest -- --only pr-8-2025  # one document (add --force to re-embed it even if unchanged)
```

## Meeting Notes (add-on, Option B)

Open **Meeting Notes** (`/notes`), paste notes from a meeting or call (or click one of the samples), set the meeting date and time, and click **Extract**. Gemini drafts:

- **People**, each matched to an existing contact by email, or suggested by name and company, or offered as a new lead. taxPOD staff are recognised and not added as contacts.
- **Opportunities**: create a new one, or link to the contact's open deal and optionally move its stage.
- **Action items** with owner and due date ("next Friday" is worked out from the meeting date).
- A **summary** of the meeting.

Every item shows the quote from the notes it came from. Emails or phone numbers that aren't in the notes are removed, and quotes that can't be found are flagged. Edit anything, choose create / update / link / skip for each row, then **Confirm and save**. The contacts, opportunities and activities are written in one transaction (all or nothing) and appear on the lead pages, the Kanban board and the dashboard feed. Nothing is written before you confirm.

Extraction runs on `GEMINI_NOTES_MODEL` (`gemini-3.1-flash-lite`, about 3 s, a separate quota from Tax Q&A) and falls back to `GEMINI_CHAT_MODEL`. Each extraction is logged to the `meeting_notes` table along with what you confirmed. Code: [`lib/notes/`](lib/notes). Design: [ARCHITECTURE.md §6](ARCHITECTURE.md#6-meeting-notes-extractor-design).

## Evaluation

`npm run eval` runs 13 test questions ([`eval/questions.json`](eval/questions.json): 10 the documents answer, each with its expected document and pages, and 3 they don't) through the same code as the UI, and reports the retrieval hit rate @1, 3, 6 and 10.

```bash
npm run eval                          # retrieval only: needs embeddings, no answer quota (a few seconds)
npm run eval -- --answers             # also generates and checks every answer (13 Gemini calls, ~3 min)
npm run eval -- --mode hybrid         # experiments: hybrid (vector + full text) or rerank (LLM reorders the top 20)
npm run eval -- --only q07,q10        # a subset; prints only, doesn't overwrite the results files
npm run eval:notes                    # Meeting Notes: 4 samples, found / missed / extra items (4 calls)
```

Results are in [`eval/results/`](eval/results), and what they showed is in [ARCHITECTURE.md §7](ARCHITECTURE.md#7-evaluation):

- **Retrieval:** the expected document ranks first for 9/10 questions and is in the 10 passages the model reads for 10/10.
- **Answers:** 10/10 cited the expected document; 3/3 out-of-scope questions were refused.
- **Meeting Notes:** all 8 people, 11 action items and 4 opportunities found, with every checked field correct and no invented items.

## Gemini free-tier limits

Measured during the build (Google doesn't publish them per model):

- **`gemini-3.5-flash` (Tax Q&A answers): 5 requests a minute, 20 a day.** It also often returns 503 "high demand". When it's busy or out of quota, the app tries `GEMINI_FALLBACK_MODEL` (`gemini-3.1-flash-lite`, separate quota) once, then tells you when to retry.
- **Embeddings** have a separate, larger limit (30,000 tokens a minute), so search and `npm run eval` keep working when answers are out of quota.
- Limits are per Google Cloud project and model, and reset at midnight Pacific time.

For lots of testing, set `GEMINI_CHAT_MODEL=gemini-3.5-flash-lite` (its own quota) in `.env`, or use a key from a project with billing enabled.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Is Docker running?" on a page | Start Docker, then `npm run db:up` |
| "No documents are loaded yet" on Tax Q&A | The knowledge base is empty: run it |
| "free-tier daily limit is used up" / 429 `PerDay` | See [Gemini free-tier limits](#gemini-free-tier-limits) |
| "Gemini is busy right now" | 503 on both models; retry in a minute |
| A model returns 404 / "no longer available" | Model names change. `npm run check:gemini` lists what your key can use; set `GEMINI_CHAT_MODEL` etc. in `.env` |
| Port 5433 already in use | Set `DB_PORT` in `.env` and the same port in `DATABASE_URL` |

**Database.** The schema is in [`db/schema.sql`](db/schema.sql) and loads when the container starts with an empty volume. `npm run db:psql` opens a psql shell. `npm run db:reset` drops all data and reloads the schema; run `npm run seed` and `npm run ingest` again afterwards.

## Project layout

| Path | What's there |
|---|---|
| `app/` | Next.js pages and Server Actions: dashboard, leads, opportunities, `ask` (Tax Q&A), `notes`, `status` |
| `components/` | UI: `crm/`, `rag/`, `notes/`, and shadcn/ui in `ui/` |
| `lib/llm.ts` | Every Gemini call: embeddings, `generateJson()` with schema, fallback model, error handling |
| `lib/rag/` | Document manifest, PDF parsing, chunking, retrieval, the prompt, answering and citation checks |
| `lib/notes/` | Meeting Notes: extraction schema and prompt, grounding checks, contact matching, confirm transaction |
| `lib/crm/` | CRM queries (raw SQL) and zod schemas |
| `scripts/` | `ingest`, `ask`, `eval`, `eval-notes`, `seed`, `check-gemini` |
| `eval/` | Test questions, meeting-notes samples, results |
| `db/schema.sql` | All tables and indexes |
| `public/documents/` | The 9 source PDFs |

## How this was built

Built in under a week with Claude Code, one milestone at a time. Each milestone started with a written plan whose decisions were agreed before any coding:

- [`docs/PLAN.md`](docs/PLAN.md): priorities, how the brief was interpreted, stack, milestones
- [`docs/milestones/`](docs/milestones): the plan for each milestone (M0–M6), with every decision and its alternatives, and notes on what changed during the build
- [`docs/ai-usage-log.md`](docs/ai-usage-log.md): the running log behind [AI_USAGE.md](AI_USAGE.md)
- [`docs/BRIEF.md`](docs/BRIEF.md): the case study brief
