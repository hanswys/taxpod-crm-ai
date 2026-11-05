# M4 — RAG: evaluation

**Status:** Done
**Dates:** 2026-11-05 → 2026-11-05
**Branch / PR:** `hanswys/qoku6`

## 1. Goal

A reproducible `npm run eval` that runs a fixed set of test questions through the real retrieval code and reports **hit rate @k** against each question's expected source document, plus an optional run that checks the full answers (correct answer vs correct refusal, right document cited). Use it to tune the similarity floor and test the experiments M3 deferred (rerank, hybrid search, conflicting sources), keep only what measurably helps, and write the results and lessons into ARCHITECTURE.md §7.

Covers brief Part 2 (5): "write 8-10 test questions with the expected source document, run them, and report your retrieval hit rate and what you learned", and the "evaluation results" part of ARCHITECTURE.md.

Not in scope: changing the chunker or embedding model (each change is a ~6 min re-ingest on the free tier; noted under "what I'd do differently" instead), multi-turn questions.

## 2. Decisions

D-a to D-f were agreed on 2026-11-05 as recommended.

| Decision | Choice | Why | Alternatives considered |
|---|---|---|---|
| **D-a. Question set** | **Decided: 10 answerable questions + 3 that should be refused.** One answerable question per document (9) + one conflicting-sources question; refusals: off-topic, near-domain (other country), and Malaysian tax that isn't in the knowledge base. A few answerable questions phrased the way a sales rep would ask, not in the documents' wording. | Matches the brief's 8–10 and covers every document, so a document that never ranks shows up. The refusals test the "say so rather than guess" requirement, which hit rate alone can't. Rep-style wording keeps the set from being easy because it copies the text. | 8–10 only, no refusals (doesn't test the guard); 20–30 questions (more reliable numbers, but takes longer to write and check by hand, and uses more of the 20/day answer quota) |
| **D-b. What counts as a hit** | **Decided: two levels.** Main metric: **document hit @k**, meaning a passage from an expected document is in the top k. Stricter: **section hit @k**, meaning a passage overlaps the expected pages. Report @1, @3, @6 (production k), @10, plus MRR. A question may list more than one acceptable document. | Document level is what the brief asks for. Page level catches "right document, wrong part", which document level misses: the e-Invoice Guideline has 59 chunks. @10 shows whether k = 6 cuts off answers. MRR summarises rank in one number for comparing experiments. | Document only (simpler, but hides wrong-section results); grading each passage by hand (most accurate, doesn't repeat cheaply) |
| **D-c. Checking answers, not just retrieval** | **Decided: retrieval by default, answers on request.** `npm run eval` measures retrieval only (embeddings, no generation quota). `npm run eval -- --answers` also runs the real `ask()` on all 13 and checks automatically: answerable → answered and cited an expected document; refusal → refused (and which guard layer). **Faithfulness** (does each cited sentence match its passage) is checked **by me reading the answers**, and the results go in a table in §7. | Retrieval-only runs are free and repeatable, so tuning stays cheap. The answer run uses 13 of the 20 daily answers, so it runs a few times, not on every change. A hand-checked faithfulness table for 10 answers is credible and costs nothing; an LLM judge doubles the calls and needs checking itself. | Retrieval only (meets the brief, but leaves the refusal guard and M3's open faithfulness check unmeasured); an LLM judge scoring faithfulness (automated, but uses quota and is less trustworthy at this size) |
| **D-d. Experiments** | **Decided: three, each kept only if it helps on the eval.** (1) **Similarity floor:** set from the scores of the answerable vs refused questions. (2) **Hybrid search:** Postgres full-text rank combined with vector rank (reciprocal rank fusion). No API calls, and it helps exact terms like "RM2,000" or "DST-02". (3) **LLM rerank** (promised in M3 D-c): take the vector top 20, one Gemini call orders them, keep the top 6. Runs on the Flash-Lite model to spare Flash quota. | All three come from M2/M3 findings: the "Legal Services" section ranked 2nd twice, and the floor of 0.55 was set from 2 data points. Hybrid search costs nothing to try. Rerank is the bonus the brief names, but adds a call and seconds per question, so it has to pay for itself. | Floor only (least work, but the "learned" section is thin); chunk-size or embedding-model changes (each needs a re-ingest and a second copy of the chunks; noted for "with more time"); deduplicating overlapping chunks (small effect; only if the eval shows duplicates crowding the top 6) |
| **D-e. Conflicting sources** (M3 finding: legal services "6%" from the 2021 guide vs "8% from 1 March 2024" in the 2026 guide) | **Decided: show each passage's publication date in the prompt and add a rule:** "if sources disagree, prefer the most recent and mention the difference". Measured by the conflict question in the answer run. | The date is already on every passage; one header change and one rule. The answer was faithful to its sources but wrong today, which is the worst failure for a tax tool. | Leave it and document it as a limitation (honest, but a cheap fix exists); drop the 2021 guide (hides the problem, and loses the only per-profession guide) |
| **D-f. Where questions and results live** | **Decided:** `eval/questions.json` (validated with zod on load; every slug must exist in `SOURCES`). Each run prints a table and writes `eval/results/<mode>.md`. These files are committed, so a reviewer sees the latest numbers without running anything. | JSON is easy for a reviewer to read and edit. Committed results make the ARCHITECTURE.md numbers traceable to a file. | A `.ts` question file (type-checked slugs, but less readable); results only printed to the console (nothing to link to) |

Follows from earlier milestones: eval calls `retrieve()` / `ask()` from `lib/rag/` directly, so it measures exactly what the UI does (M3). No test framework (as M1–M3).

## 3. Design

### 3.1 Question file (`eval/questions.json`)

```jsonc
[
  {
    "id": "q01",
    "question": "Who doesn't have to issue e-Invoices?",
    "expected": [{ "slug": "einvoice-guideline", "pages": [15, 17] }], // pages: inclusive range, for section hit
    "note": "rep wording; M2/M3 used 'Who is exempt from issuing e-Invoices?'"
  },
  {
    "id": "n01",
    "question": "What is the capital of France?",
    "expected": [] // empty = should be refused
  }
]
```

### 3.2 Question set (agreed; expected pages checked against the PDFs during the build)

| id | Question (draft) | Expected document → section | Tests |
|---|---|---|---|
| q01 | Who doesn't have to issue e-Invoices? | e-Invoice Guideline → 1.6 Exemptions (pp. 15–17) | rep wording |
| q02 | My client sells to individual consumers who don't want an e-Invoice. What do they do? | e-Invoice Specific Guideline → 3. Transactions with buyers / consolidated e-Invoice | rep wording, long section (29 chunks) |
| q03 | What is the tax rate for an SME company? | PR 8/2025 → 6. Special tax treatment (pp. 19–20) | figures from a flattened table |
| q04 | Can I claim tax relief for my child's education fees? | PR 7/2025 → 6. Allowable deduction | largest document section (63 chunks) |
| q05 | If an employer pays the employee's income tax, is that taxable to the employee? | PR 3/2024 → 5. Tax borne by employer as a perquisite (p. 6) | |
| q06 | My client bought a laptop on hire purchase. Can they claim the small value asset allowance? | PR 4/2026 → 13. Hire purchase (p. 13) | exact term (hybrid search); _changed from the draft, see §7_ |
| q07 | Is service tax charged on legal services? | SST Professional Services → Legal Services (pp. 5–6) | ranked 2nd in M2/M3 (rerank) |
| q08 | Do intra-group management fees attract service tax? | SST Management Services → Group relief (pp. 10–15) | rep wording |
| q09 | When does a foreign digital service provider have to register for service tax? | SST Digital Services by FSP → Mandatory registration (pp. 15–18) | |
| q10 | What is the current service tax rate on legal services? | SST Management Services → Changes of rate (p. 5) **or** SST Professional Services → Legal Services | conflicting sources (D-e) |
| n01 | What is the capital of France? | none | off-topic, floor (`low_similarity`) |
| n02 | What is the corporate income tax rate in Singapore? | none | near-domain, model refusal |
| n03 | What is the real property gains tax rate when selling a house after 5 years? | none | Malaysian tax, not in the knowledge base |

q01, q03, q04, q07 and n01–n02 overlap with the M2/M3 sanity questions (wording changed where noted). That's fine for the eval, but the floor was originally set from n01–n02, so the floor discussion in ARCHITECTURE.md says so.

### 3.3 Metrics

Per question: rank of the first passage from an expected document (doc rank), rank of the first passage overlapping expected pages (section rank), top-1 similarity.

Summary over the 10 answerable questions:
- **Doc hit @k** = share of questions with doc rank ≤ k, for k ∈ {1, 3, 6, 10}
- **Section hit @k**, same with section rank
- **MRR** = mean of 1 / doc rank (0 if not in the top 10)
- **Score gap:** lowest top-1 score among answerable questions vs highest among refusals (input for the floor)

With `--answers`, also:
- **Answered correctly:** answerable questions where `outcome = answer` and at least one citation is from an expected document
- **Refused correctly:** refusal questions where `outcome = not_found` (and which reason)
- Latency per question, model used (primary vs fallback)

### 3.4 Script (`scripts/eval.ts`, `npm run eval`)

```
npm run eval                          retrieval only, production settings (vector top 10)
npm run eval -- --mode hybrid         retrieval with hybrid search
npm run eval -- --mode rerank         retrieval with LLM rerank (1 Flash-Lite call per question)
npm run eval -- --answers             also run ask() on every question, paced ≤ 5 a minute
npm run eval -- --only q07,q10        a subset (to save quota while tuning)
```

- Embeds all questions in **one** batched call, then searches top 10 per question.
- Prints a per-question table and the summary; writes `eval/results/<mode>[-answers].md` with the date, settings (k, floor, models, chunker version) and both tables.
- The answer run goes through `ask()`, so it is also logged to `rag_queries` like a UI question.
- Exits non-zero only on errors (not on a low hit rate): it reports, it doesn't gate.

### 3.5 Experiments (in `lib/rag/retrieve.ts`, behind a `mode` option)

- **Hybrid:** vector top 20 and full-text top 20 (`websearch_to_tsquery('english', question)` ranked by `ts_rank` on `to_tsvector('english', content)`, computed at query time: 497 chunks, no schema change), merged by reciprocal rank fusion (`1 / (60 + rank)`), top k. If kept: add a generated `tsvector` column + GIN index (additive, no re-ingest).
- **Rerank:** vector top 20 → one `generateJson()` call with the 20 passages (title, section, first ~600 chars) and the question, asking for the passage numbers ordered by relevance → top k. Falls back to vector order if the call fails, so it never breaks an answer.
- Whichever mode wins becomes the default in `ask()` only if it improves doc hit @1/@3 or MRR **and** doesn't lower doc hit @6. With 10 questions, one question is 10 points, so ARCHITECTURE.md reports counts ("8/10") and treats a one-question difference as noise.

### 3.6 Write-up (ARCHITECTURE.md §7)

Question table, results table per mode, the chosen floor with the score gap, answer-run results, the faithfulness table, and "what I learned" (expected themes: right document is easy, right section is harder in long documents; refusal needs the prompt, not the floor; dated sources matter in tax). Brief summary in README.

## 4. Tasks

- [x] Workspace setup: `.env` (ask for the key), point `DATABASE_URL` at the ingested `victoria-db-1` (port 5435, 497 chunks, has `rag_queries`)
- [x] Agree the question set; check every expected page range against the PDFs; write `eval/questions.json`
- [x] `scripts/eval.ts` retrieval mode + `npm run eval`; baseline run, commit `eval/results/vector.md`
- [x] Floor: compare scores, pick the value, update `SIMILARITY_FLOOR` and its comment
- [x] Hybrid mode; run; compare
- [x] Rerank mode; run; compare
- [x] Keep or drop each experiment; wire the winner into `ask()` (and the `/ask` passages disclosure still shows scores sensibly)
- [x] D-e: dates in passage headers + conflict rule in `lib/rag/prompt.ts`
- [x] `--answers` run; read every answer and fill the faithfulness table (§7)
- [x] ARCHITECTURE.md §7 (+ §5.5 / §5.7 if retrieval or the floor changed), README "Evaluation" section, `.env.example` if a new variable is added
- [x] AI usage log entries
- [x] lint / typecheck / build

## 5. Exit criteria / how to verify

- [ ] `npm run eval` runs from a clean checkout with an ingested DB, needs no generation quota, and prints doc and section hit @1/3/6/10 + MRR
- [ ] Two runs in a row give the same retrieval numbers (deterministic apart from rerank)
- [ ] `npm run eval -- --answers` reports answered / refused correctly for all 13 questions
- [ ] All 3 refusal questions are refused, with no invented figures
- [ ] q10 (conflict) answer gives 8% or mentions both rates with dates
- [ ] Each experiment has a recorded result and a keep / drop decision with the reason
- [x] ARCHITECTURE.md §7 has the question set, results tables and lessons; numbers match the committed `eval/results/*.md`
- [x] lint / typecheck / build pass

## 6. Risks & open questions

- **Generation quota (20/day on `gemini-3.5-flash`, 5/min).** One answer run is 13 calls; rerank is 10 more on Flash-Lite. Plan: retrieval runs all day (free), answer runs at most once or twice, and `--only` for re-checks. A second API key would remove the constraint; ask if it runs out.
- **Small set, noisy numbers.** 10 questions can't prove one setting is better. Report counts, call one-question differences noise, and say so in the write-up.
- **Writing the questions after reading the documents** makes them easier than real questions. Rep-style wording reduces this; the write-up says how the questions were made.
- **Hit rate may already be 10/10 at @6**, leaving experiments nothing to improve there. Then @1, section hit and MRR are what tell modes apart, which is why they're reported.
- **Full-text search on flattened tables** may match noise (numbers in tables); check the hybrid top 10s by eye, not only the numbers.

## 7. Notes & outcome (fill in at the end)

### Build (2026-11-05)

**Question set.** Checking expected pages against the chunks changed one question: the draft q06 ("maximum value of a small value asset") is also answered by PR 8/2025 §6.3 (pp. 20–21, "RM2,000"), so a hit wouldn't show that PR 4/2026 itself is found. Replaced with the hire-purchase rule (PR 4/2026 §13, p. 13), which no other document covers. Also confirmed: no document mentions real property gains tax (n03 is a fair refusal); the 8% rate is in SST Management Services p. 5, so q10 accepts either SST guide.

**q10 scoring tightened.** The first baseline counted q10 as a hit because the 2021 Professional Services guide was an accepted source. That guide gives the outdated 6%, and the passage with today's 8% (Management Services v5, p. 5) ranked **9th**, outside the 6 passages the model sees. Only the 8% passage counts now, so the eval shows the problem instead of hiding it.

**Retrieval results** (10 answerable questions; full tables in `eval/results/*.md`):

| Mode | Doc hit @1 / @3 / @6 / @10 | Section hit @1 / @3 / @6 / @10 | MRR |
|---|---|---|---|
| vector (production) | 9 / 9 / 9 / 10 | 7 / 9 / 9 / 10 | 0.911 |
| hybrid (vector + full text, RRF) | 8 / 9 / 9 / 9 | 2 / 6 / 8 / 9 | 0.833 |
| rerank (vector top 20 → `gemini-3.5-flash-lite`) | 9 / 9 / 9 / 10 | 7 / 9 / 9 / 10 | 0.911 |

- **Vector search finds the right document first for 9/10.** The miss is q10: the passage with the answer doesn't mention legal services (it's a general rate change), so 8 Professional Services chunks about legal services outrank it.
- **Hybrid is clearly worse** (section hit @1 7 → 2). OR-ing every word of a natural-language question makes full text favour long chunks full of common words ("service", "tax", "client"); "capital of France" matches "share capital". Dropped. The mode stays in the eval so the result can be reproduced.
- **Rerank ties vector search on every number.** Per question it moved things both ways: q07 "Legal Services" went from 2nd to 1st (the M2/M3 issue), q02's section went from 1st to 2nd, and q10's 8% passage stayed 9th. No measurable gain for a second model call per question, so dropped (kept as an eval mode).
- **Free tier, again.** `gemini-3.1-flash-lite` returned 503 for the whole first rerank attempt, and the rerank code quietly fell back to vector order, which would have produced a results file that was really vector results. Now the eval runs rerank in `strict` mode (a failed call stops the run), and rerank uses its own model (`GEMINI_RERANK_MODEL`, default `gemini-3.5-flash-lite`, separate quota).
- **Similarity scores:** answerable questions 0.705–0.761, refusals 0.504 (France), 0.601 (RPGT), 0.603 (Singapore).

**Conflicting sources (D-e).** Publication dates are now in each passage header, plus a rule to prefer the newest source and mention the older figure. q10 via `npm run ask` (Flash daily limit used up, so the fallback `gemini-3.1-flash-lite` answered):
- k = 6: "subject to service tax at the rate of 6%". The 8% passage isn't in the context, so the rule can't help.
- k = 10: "The current service tax rate for legal services is 8%, effective 1 March 2024 [1]. This represents an increase from the 6% rate cited in previous guides published on 21 September 2021 [2][3][4]." Correct, with both sources cited.

**Tuning decisions (agreed 2026-11-05):**
- **k = 6 → 10** (`TOP_K`). Fixes q10; costs ~1,300 more prompt tokens per question. The answer run checks that the extra passages don't make other answers worse; if they do, go back to 6 and write q10 up as a known limitation.
- **Floor stays at 0.55.** Answerable 0.705–0.761 vs near-domain refusals 0.601–0.603: a floor high enough to catch those leaves ~0.05–0.10 of margin either side, which is too little evidence from 13 questions. The floor stops clearly off-topic questions (France 0.504) for free; the prompt handles near-domain ones (checked in the answer run).
- **Hybrid and rerank dropped** (results above); `RETRIEVAL_MODE` stays `vector`.
- **Answer run waits for the Flash daily reset** (08:00 UTC), so it measures the production model.

### Answer run (2026-11-05, after the Flash daily reset)

`npm run eval -- --answers`, `gemini-3.5-flash`, k = 10 (`eval/results/vector-answers.md`): **10/10 answered with a citation to the expected document, 3/3 refused** (n01 at the floor in 0.5 s; n02, n03 `model_declined`). All answers came from the primary model; 3.4–8.6 s, q04 17.4 s.

**Faithfulness (read by hand against the cited passages):**

| id | Verdict | Checked |
|---|---|---|
| q01 | Faithful | The five exempt categories; RM3,000,000 threshold and its exceptions (non-individual shareholders, subsidiaries) on pp. 15–17 |
| q02 | Faithful | Normal receipt, monthly consolidated e-Invoice within 7 days after month end, not shared with buyers |
| q03 | Faithful | 24% general; 15% / 17% / 24% bands from YA 2023; the YA 2020–2022 note; eligibility criteria (Table 5, flattened, read correctly) |
| q04 | Faithful, broad | Child care RM3,000 (YA 2020–2027), child relief RM8,000, NESS RM8,000, education insurance RM4,000 from YA 2025. Says what the documents don't cover (direct deduction of a child's tuition fees) |
| q05 | Faithful | Perquisite under paragraph 13(1)(a); taxed in the year the tax can be determined |
| q06 | Faithful | Not available on hire purchase; normal capital allowances instead (§13) |
| q07 | **Faithful but outdated** | Quotes 6% from the 2021 guide. The 8% passage isn't in the top 10 for this wording, so the date rule can't help |
| q08 | Faithful | Group relief; the 2018–2019 rule; the 5% third-party test from 1 January 2020 |
| q09 | Faithful | RM500,000 over 12 months, historical or future method, register by the end of the following month |
| q10 | Faithful, cautious | 6% as of the 2021 guide, 8% on all taxable services from 1 March 2024, and notes the documents don't say whether legal services are among the exceptions. (The fallback Flash-Lite model, tested earlier, stated "8%" flatly, a step further than the passage supports.) |

**Outcome.** Production settings after M4: vector search, k = 10, floor 0.55, dated passages + "prefer the newest" rule. Hybrid and rerank are eval modes only. Results, lessons and the question set are in ARCHITECTURE.md §7; README has an Evaluation section and a note on free-tier limits.

**Follow-ups:** a bigger eval set written without reading the documents; flagging superseded documents (q07); chunk-size and embedding experiments once re-ingesting is cheap (all in ARCHITECTURE.md §8).
