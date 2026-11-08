# M6 — Docs, polish & submission

**Status:** In progress
**Dates:** 2026-11-05 → target submit **Sat 2026-11-07** (deadline Tue 11-10)
**Branch / PR:** `hanswys/wz6b7`

## 1. Goal

A reviewer who has never seen the project can open the repo, follow the README alone on a fresh machine, and get the CRM, Tax Q&A and Meeting Notes running. They can also read the three required documents (README, ARCHITECTURE.md, AI_USAGE.md) and watch a 3–5 minute recording. Then the submission email is sent.

Covers the brief's **Deliverables** and **Submission Guidelines** sections: runs locally from README, `.env.example`, README with ingestion steps and how to trigger RAG and the add-on, ARCHITECTURE.md (diagram, data model, AI design, eval results, "what I'd do differently"), **AI_USAGE.md (required)**, recording / deployed link, email with the right subject.

Not in scope: new features. Bugs found during the final walkthrough get fixed; nice-to-haves go into ARCHITECTURE §8.

## 2. Decisions

D-a to D-h were agreed on 2026-11-05 as recommended.

| Decision | Choice | Why | Alternatives considered |
|---|---|---|---|
| **D-a. Deployed link or recording** (PLAN D9) | **Decided: recording only.** A 3–5 min screen recording, linked at the top of the README. PLAN D9 stays "none", and the reasons go in ARCHITECTURE §3. | A public deploy with no login and a free Gemini key is fragile: anyone can edit or delete the CRM data, and a few visitors use up the 20 answers/day, so a reviewer who tries it later sees "quota used up". A recording always works. The brief accepts either ("deployed link **or** recording"). | Deploy to Vercel + Neon/Supabase as well (works with `schema.sql` and a `pg_dump` of the chunks; needs basic-auth on the whole site, a separate key, and a check on interview day that it still works); deploy only (same risks, nothing to fall back on) |
| **D-b. How reviewers get the code** | **Decided: make the GitHub repo public** just before sending the email. Full history already checked: no API keys in any commit. | One link and no setup for HR, who may not have GitHub accounts or know who will review. The 9 tax PDFs are public government documents. | Keep it private and invite reviewers (we don't know their GitHub usernames); ZIP attached to the email (always works, but drops the PR history, and Mermaid diagrams don't render outside GitHub) |
| **D-c. The "one real example" in AI_USAGE.md** | **Decided: the stack simplification (11-03).** Your prompt "Could we make the proposed stack simpler? like everything local if possible? explain why or why not", the AI's first stack (Supabase + Vercel + ORM) next to its revised one (Docker pgvector + raw SQL), plus its answer to your Ollama suggestion and why you accepted it. Quoted verbatim from the session transcript; 3–4 shorter examples follow it (M4 lenient eval, M3 6% vs 8%, M2 chunker, M0 contact delete). | It's the clearest case of *you* changing the AI's output, and the change shaped the whole architecture, including the vector store the brief asks about. The brief asks "what you changed and why", so the human part matters most. The RAG-specific stories still appear as short examples. | **M0 contact delete** ("But C is more real life practical right?"): you pushed back, but the final choice stayed as the AI first proposed, so less "changed"; **M4 lenient eval**: the strongest RAG story, but the AI made the catch, so your role is thin |
| **D-d. ARCHITECTURE.md (495 lines)** | **Decided: light pass plus a summary at the top.** Add a short "at a glance" section (the 8–10 key decisions with one-line reasons, and the headline eval numbers) and a table of contents. Remove the M0 status note and the "_(M5)_" markers. Make sure the stack choice is justified in its own words. No restructuring. | Each section was written and checked when its milestone landed, so rewriting risks breaking accurate detail. Reviewers skim first, so the summary is the part that changes how it reads. | Cut it down to ~200 lines, moving detail to `docs/` (shorter, but a day of rewriting and re-checking facts); leave it as is (fastest, but it opens with a stale note) |
| **D-e. Clean-clone test** | **Decided: the full path, ingest included.** Fresh `git clone` into a temp folder, its own DB on a spare port, `npm ci`, then the README steps in order, including a real `npm run ingest` from an empty DB (~6 min of embedding quota, which is separate from the 20/day answer quota). Then `npm run build && npm start`, one question, one extraction, `npm run eval`. Anything I had to know that the README didn't say gets fixed in the README. | "Runs locally from README, including how to ingest" is a stated deliverable, and ingest is the step every workspace so far has skipped by copying the DB. | Copy the chunks in instead of ingesting (saves 6 min, but leaves the riskiest step untested); ask a friend to do it on their machine (the truest test, if someone is available) |
| **D-f. Recording** | **Decided: you record it with your voice; I write the script and prepare the app.** ~4 min: dashboard → lead → Kanban drag (30 s); Tax Q&A: one cited answer, click a citation to open the PDF page, a filtered question, an out-of-scope refusal, the retrieved passages (2 min); Meeting Notes: sample → review → confirm → result on the lead page (1 min); `npm run eval` output (20 s). Record after the daily quota reset (08:00 UTC = 4 pm MYT) on fresh seed data. Upload as an unlisted YouTube or Loom video. | Narrating it doubles as rehearsal for the interview, where you present the same thing. Scripted questions mean we know beforehand that each answer looks good, and the recording uses only ~5 answer calls. | A silent recording made by the AI driving the browser (no effort from you, but no narration and it looks automated); screenshots in the README only (not what the brief asks for) |
| **D-g. Planning docs in the repo** (`docs/PLAN.md`, `docs/milestones/`, `docs/ai-usage-log.md`) | **Decided: keep them,** with a "How this was built" section in the README pointing to them. | They're direct evidence of "how you think, how you design, and how you leverage AI": a plan per milestone, decisions with alternatives, outcomes. AI_USAGE.md can link to them instead of repeating them. | Remove them for a tidier repo (loses the best evidence of process); move them to a separate branch |
| **D-h. Spare days before the deadline** | **Decided: no new features, submit Sat 11-07.** Keep Sun–Mon as buffer and for interview prep (a one-page talk track). | We're 3 days ahead of plan. Every feature added now needs its docs, eval and recording updated, and risks breaking what's tested. Submitting early leaves room for a re-send if something's wrong. | Add "Ask about this client" (a Tax Q&A button on a lead page with the client's context; the brief mentions it, about half a day) before recording; use the time for a bigger eval set |

Follows from earlier milestones, not re-decided: Gemini free tier, quota per project + model, resets 08:00 UTC; no test framework; one PR per milestone.

## 3. Design

### 3.1 README (rewrite top, trim bottom)

1. One-paragraph intro + **demo video link** + links to ARCHITECTURE.md and AI_USAGE.md.
2. **Quick start**: prerequisites, then the 6 commands, with expected output and timings ("ingest ~6 min").
3. Using it: Dashboard / Leads / Opportunities, **Tax Q&A (RAG)**, **Meeting Notes (add-on)**: what each is and how to trigger it (existing text, tightened).
4. Evaluation: commands + headline numbers.
5. Gemini free-tier limits and what to do about them.
6. Troubleshooting: port taken, quota 429, 503 "high demand", `db:reset`.
7. Project layout (one line per folder) and **How this was built** (D-g).

Remove: "Work in progress", and the "Database created before M3/M5?" notes. Those were for our own workspaces; a fresh clone never has an old DB.

### 3.2 AI_USAGE.md outline

1. **Tools used and for what**: Claude Code in Conductor (planning, code, browser checks, docs), parallel workspaces per milestone; Google AI Studio (key and model checks). _To confirm with you: any other tools (ChatGPT, Copilot, Cursor)?_
2. **How I worked with it**: plan each milestone in a doc first and agree on the decisions; ask for plain-language options; make it check its output against real data (dry-run chunks, eval rankings, browser runs) instead of trusting lint and types.
3. **The real example** (D-c): prompt verbatim → output (excerpt) → what I changed → why.
4. **Shorter examples**: 3–4 from the log's candidate list, 3–5 lines each.
5. **Where AI helped most** / **where it fell short**: taken from the log (stale model names and doc URLs, the old Next.js APIs, the half-cleared field in the browser test, quiet fallbacks in experiments).
6. Link to `docs/ai-usage-log.md` for the full record.

The `_fill in_` cells in `docs/ai-usage-log.md` (what you changed, helped or fell short) are your judgement. I'll draft them from the transcripts and you correct them.

**Transcripts contain your Gemini key** (pasted into chats in M3–M5). Every quote gets checked for it before committing.

### 3.3 ARCHITECTURE.md pass

- New §0 "At a glance": key decisions table, eval headline, links into sections.
- Table of contents.
- Remove stale status note and "_(Mx)_" markers.
- §3: why there's no deploy (D-a).
- §8: anything found in M6 that we decided not to fix.
- Check every number against `eval/results/` once more (retrieval 9/10 @1, 10/10 @10; answers 10/10 cited, 3/3 refused; notes 8/8, 11/11, 4/4).

### 3.4 Recording script

Written to `docs/demo-script.md` (committed, so the interview walkthrough can follow it): the exact questions (picked from those whose answers we've already checked), what to click, what to say in one line each.

## 4. Tasks

- [x] Agree D-a … D-h
- [x] Set up this workspace: `.env`, own DB on a free port, copy chunks in (see memory "workspace setup")
- [x] Walk through every page in the browser; fix bugs only; `npm run lint`, `typecheck`, `build` green
- [x] README rewrite (§3.1)
- [x] ARCHITECTURE.md pass (§3.3)
- [x] Pull verbatim prompts/outputs from transcripts; draft AI_USAGE.md (§3.2); draft the log's `_fill in_` cells → you review
- [x] AI usage log: add the M6 rows
- [x] Clean-clone test (D-e), 2026-11-05: fresh clone → `npm install` → `db:up` → `seed` → `ingest` from an empty DB (497 chunks, 24 embed calls, 7 min 08 s; re-run skipped all in 0.7 s) → `build` → `eval` (same numbers as committed: doc hit 9/10 @1, 10/10 @10, MRR 0.911) → one answer (4 valid citations) and one refusal, both via the fallback model because Flash's daily quota was used up → one extraction (`eval:notes --only s3`, all as expected). Missing-key message checked. README fix: ingest time 6 → 7 min.
- [x] `docs/demo-script.md` (D-f)
- [x] PLAN.md: milestone statuses, D9 outcome, deliverables checklist ticked
- [ ] PR merged to `main`
- [x] **You:** record and upload the video → add the link to the README (Loom, 8 Nov)
- [ ] **You:** make the repo public (D-b), final check of the GitHub page logged out
- [ ] **You:** send the email: subject `[Your Full Name] — CRM Assessment Submission`, repo link + video link (I can prepare a Gmail draft if you give me the HR address)
- [ ] Optional: one-page interview talk track (not committed)

## 5. Exit criteria / how to verify

- [x] Fresh clone → README steps only → CRM, cited answer, refusal, extraction and `npm run eval` all work (D-e)
- [x] `npm run build` and `npm start` work (not just `dev`): all 9 pages load with no console errors or failed requests
- [x] README, ARCHITECTURE.md, AI_USAGE.md cover every item in the brief's Deliverables (checked line by line against `docs/BRIEF.md`; the video link is the only gap)
- [ ] No secrets: `git log -p` scan for `AIza` / `AQ.` keys and `GEMINI_API_KEY=` values is clean, including AI_USAGE quotes
- [ ] Video 3–5 min, plays logged out, linked in the README
- [ ] Repo public and viewable logged out; email sent

## 6. Risks & open questions

- **Quota on recording day.** The clean-clone test and recording both use answers. Do the clean-clone test the day before recording, or set `GEMINI_CHAT_MODEL=gemini-3.5-flash-lite` for the test.
- **503 "high demand" during recording.** The fallback model covers it, but the answer may look different from the rehearsal. Do a full take and re-record if needed; scripted questions keep it short.
- **Model names change.** `gemini-3.5-flash` etc. could be retired before the reviewer runs it (it happened on day 1). The README tells them to run `npm run check:gemini` and set the model in `.env`; the clean-clone test checks that path.
- **Answered 11-05:** name and HR address for the email (kept out of the repo); tools: Claude Code and Conductor, nothing else.
- **Decided 2026-11-05: remove the brief before going public (option A).** `docs/BRIEF.md` is now gitignored (kept locally for future sessions) and no longer in the tracked files. It remains in old commits and PR #1's diff, accepted as low risk. Original note: **the brief is in the repo.** `docs/BRIEF.md` is the full case study, committed since PR #1 (the AI flagged this on 11-03). It isn't marked confidential, but a public repo publishes the company's assessment, and removing the file now leaves it in old commits and PR diffs. Decide before D-b.

## 7. Notes & outcome (fill in at the end)
