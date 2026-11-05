# AI Usage

How I used AI tools to build this project: which tools, how I worked with them, one real example in full, and where they helped and fell short. The full running log, one row per session, is in [`docs/ai-usage-log.md`](docs/ai-usage-log.md).

## 1. Tools and what I used them for

| Tool | Used for |
|---|---|
| **Claude Code** (Claude Opus 5.5) inside **Conductor** | Nearly everything: planning each milestone, writing the code, running and checking it (scripts, the eval, a headless browser for UI checks), and drafting the docs. Conductor runs each session in its own git worktree, so each milestone had its own workspace, branch and pull request. |
| **Google AI Studio** | The free Gemini API key, and checking which models the key could use. Gemini itself is part of the product (embeddings, answers, extraction), not a development tool. |

## 2. How I worked with it

- **Plan first, one milestone at a time.** Each milestone started with "Plan M*n* with me". The AI wrote a plan in [`docs/milestones/`](docs/milestones) from the template, with each open decision listed as options with a recommendation. I agreed or changed the decisions before any code was written. The overall plan in [`docs/PLAN.md`](docs/PLAN.md) stayed high-level on purpose.
- **Make it explain choices plainly.** The first plans listed decisions in dense tables. Asking "explain simply one by one each decision and the choices" got plain-language A/B/C options with trade-offs, which made it much easier to see where I disagreed. After that, every plan was presented that way.
- **Push back on defaults.** The AI's recommendation is often the simplest thing to build, not always the best one. Asking "why not X?" or "isn't C more practical?" is where most of my own decisions came from (the example below and §4.1).
- **Make it check against real data, not just the compiler.** Lint, types and builds passing told me little. The checks that found real bugs were: printing the chunker's output, an automated check that every chunk's text appears on the pages it cites, the eval's per-question rankings, and driving the real app in a browser.
- **Write things down as we go.** A log of notable AI interactions (this document's source), project notes for future sessions (e.g. how to set up a new workspace without re-ingesting), and a "Notes & outcome" section at the end of each milestone plan.

## 3. The real example: simplifying the stack

**When:** day 1 (3 Nov), planning the whole project before any code.

**Context.** I gave Claude Code the case study and asked for an overall plan, with detailed planning left to each milestone. Its first answer ended with four questions. The second one was:

> **2. Proposed stack:** Next.js with TypeScript, Postgres with pgvector running locally in Docker, Supabase for the hosted demo, and Drizzle as the database library. OK?

The first draft of the plan also had the Supabase CLI for local development and a Vercel deployment.

**My prompt** (verbatim):

> 1. Can use either Gemini free tier or an Ollama models too.
> 2. Could we make the proposed stack simpler? like everything local if possible? explain why or why not
> 3. Explain 3?
> 4. confirmed

**The output** (verbatim excerpt; the parts on points 2 and 1):

> ## 2. A simpler, local-first stack
> **Removed:**
> - Supabase CLI and the hosted Supabase plan
> - Vercel deployment (a screen recording covers this instead)
> - The ORM and migration tool
>
> **The new stack:**
> - **Next.js + TypeScript** for the UI, the API routes and the ingest/eval scripts. That's one language and one app.
> - **Postgres + pgvector in a single Docker Compose service.** The schema lives in a `db/schema.sql` file that runs when the container first starts.
> - **The `postgres` driver with plain SQL.** The vector search is plain SQL anyway, and reviewers can read the retrieval query directly.
> - **Gemini** is the only thing that isn't local.
>
> A reviewer needs only Node, Docker and a free Gemini key. […]
>
> **Why not even more local:**
> - **Ollama:** the reasons are under point 1.
> - **PGlite** (Postgres running inside Node, no Docker): only one process can open the database at a time. The ingest script and the dev server would block each other.
> - **SQLite + sqlite-vec:** it would work, but it moves away from the brief's preferred pgvector and would need justifying for no real gain.
> - **Supabase CLI locally:** it starts about 10 containers when we only need Postgres.
>
> The cost of plain SQL is that schema changes mean resetting the database with `docker compose down -v`. That's fine for a take-home project.

And on my Ollama suggestion:

> I'm not using Ollama by default because the brief asks for a "real LLM API" and lists Claude, OpenAI, Gemini or DeepSeek. A local model risks failing that rule. It would also make the reviewer download several GB of models, and small models are worse at sticking to citations and saying "not in the documents", which is what RAG is judged on. One free Gemini key covers both the LLM and embeddings.

**What I changed.**
- The stack lost three pieces: hosted Supabase plus the Supabase CLI, Vercel, and the Drizzle ORM with its migration tool. The database became one Docker container with a plain `schema.sql`, and all queries became raw SQL.
- I dropped my own Ollama idea. The AI's argument held up: the brief says "real LLM API", and a RAG module judged on citations and refusals shouldn't depend on a small local model. I kept Gemini's free tier for both the LLM and embeddings.
- No deployment; a screen recording instead. I confirmed this again in M6 (§3 of [ARCHITECTURE.md](ARCHITECTURE.md)).

**Why.** The reviewer has to run the project from the README, so every extra service is a step that can fail on their machine. The RAG module is what's assessed most closely, so an ORM adds nothing there: the similarity search is raw SQL either way, and plain SQL keeps it readable in [`lib/rag/retrieve.ts`](lib/rag/retrieve.ts).

**How it turned out.** The stack never changed after that. Setup is `cp .env.example .env`, `npm install`, `npm run db:up`, `npm run ingest`, `npm run dev`. The cost the AI named was real, though: without migrations, every schema change after M2 meant a reset, or pasting the new table into psql so the ingested chunks survived. That happened twice (M3's `rag_queries`, M5's `meeting_notes`). With a longer project I'd add a minimal migration runner.

## 4. Other examples

### 4.1 Deleting contacts: questioning the AI's recommendation (M0)

The AI offered three ways to handle deleting a contact who has opportunities: (A) delete their records with them, (B) block the delete, (C) archive instead. It recommended A as the simplest. I asked: *"But C is more real life practical right?"* It agreed (HubSpot and Salesforce use a recycle bin, and Malaysia's PDPA still needs a real purge eventually), then laid out what C would cost: every query filtering archived rows, a rule for archived contacts' opportunities in the dashboard totals, and a restore screen. It proposed a lighter C using database views. I chose A for scope and asked for C to go into "What I would do differently" ([ARCHITECTURE.md §8](ARCHITECTURE.md#8-what-i-would-do-differently-with-more-time)). The output didn't change, but I made the decision knowing what I was giving up.

### 4.2 The chunker's first design looked right and wasn't (M2)

The AI's first heading detector used reasonable-looking patterns (numbered short lines, ALL CAPS, Title Case). Lint and types passed. Printing the detected sections per document showed list items like "1. API Application Programming Interface" being treated as headings, and the e-Invoice Guideline broken into 388-character fragments. The fix was to use each PDF's own table of contents as the list of headings, which removed most of the heuristics. An automated check then replaced eyeballing: every chunk's text must appear on the pages it cites (0 misses out of 497).

### 4.3 A lenient eval scored the most important bug as a pass (M4)

The first draft of the question "What is the current service tax rate on legal services?" accepted either SST guide as the expected source, so retrieval scored 10/10. While checking a fix, the AI printed the actual top 10 and saw that the passage with today's 8% rate was ranked 9th, outside the 6 passages the model then read. The "hit" came from a 2021 guide that still says 6%. It tightened the expected source, the score dropped to 9/10, and the fix (k = 10 plus dated sources) became measurable. **Lesson:** an eval's expected source has to be the source of the *right* answer, and aggregate numbers need a look at the per-question rankings.

### 4.4 Faithful, and still wrong (M3)

"Is service tax charged on legal services?" got a well-cited answer quoting 6% from the 2021 SST guide. Before writing "the rate has since changed" into ARCHITECTURE.md, the AI checked that claim against the knowledge base instead of its own memory, and found the 2026 Management Services guide recording the change from 6% to 8% on 1 March 2024. Grounding worked as designed: it used only what it retrieved. The real problem was conflicting sources of different ages, which became the M4 test case above.

## 5. Where AI helped most

- **Turning a brief into a plan with explicit trade-offs.** Every decision came with alternatives and a reason, written down where I could disagree. That made the design phase fast and left a record for ARCHITECTURE.md.
- **Building quickly in a new stack.** Next.js 16, postgres.js 4 and `@google/genai` 2 are newer than the model's training data. It read the bundled docs in `node_modules` before writing code, and caught the API changes that way.
- **Running its own experiments.** It probed which Gemini models the key could use, measured the free-tier limits from real 429 errors, ran the eval in three modes, and drove the app in a headless browser. Most of the numbers in ARCHITECTURE.md come from runs it did, not from documentation.
- **Spotting a too-good result.** In M5 the first 3 meeting-note samples all scored 100%. Instead of reporting that, it wrote a harder fourth sample (a value range, "after CNY", an injected instruction). That sample found a real problem: a pilot discussed inside a deal became a second opportunity, which would have inflated the pipeline.

## 6. Where it fell short

- **Outdated knowledge.** The planned model `gemini-2.5-flash` had already been retired for new users on day 1. Web search returned tax-document links that were dead or two versions old. The first Next.js code used APIs that had changed. Each was caught because the plan said "verify at build time" (`npm run check:gemini`, downloading and opening every PDF, reading the bundled docs), not because the AI knew.
- **Plausible code that passes every automated check.** The chunker (4.2), and a font bug from the UI library's setup that lint, types and the build all missed, but a screenshot showed.
- **Quiet fallbacks that skewed measurements.** The rerank experiment fell back to plain vector order when Gemini returned 503s, which is right for the app but would have produced "rerank results" that were really vector results. It was caught from log warnings, and the eval now fails instead of falling back.
- **Its own test scripts can be wrong.** In M5 a browser-test script half-cleared a form field and saved "Kavitha Ra" as a name. The check caught it, but it took a moment to see the bug was in the test, not the app.
- **It recommends what's easiest to build.** Usually right for a take-home with a deadline, but the realistic option (4.1) only came up because I asked.
