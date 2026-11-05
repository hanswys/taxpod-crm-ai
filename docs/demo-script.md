# Demo script (screen recording, about 4 minutes)

Used for the submission video, and as the running order for the walkthrough in the interview. Every question below has been asked before and its answer checked against the documents (`rag_queries`, [`eval/results/vector-answers.md`](../eval/results/vector-answers.md)).

## Before recording

- [ ] Record **after 4 pm MYT** (08:00 UTC), when the daily Gemini quota resets. The take uses about 4 Flash calls and 1 Flash-Lite call; a rehearsal doubles that, which is still well under 20.
- [ ] `npm run seed` for clean demo data (the Meeting Notes step adds records), then `npm run build && npm start` (faster than `dev`, no dev overlay).
- [ ] Browser: one window at 1920×1080 or 1440×900, zoom 110–125%, bookmarks bar hidden, no other tabs. Terminal: large font, `clear`ed, in the project folder.
- [ ] Have the questions below in a text file to paste (typing on camera is slow).
- [ ] Do one full rehearsal. If Gemini returns "busy" during the take, wait a minute and re-record that part; the fallback model may phrase answers differently.

## Running order

### 1. Intro and CRM (≈ 40 s)

| Show | Say |
|---|---|
| Dashboard | "A lightweight CRM for taxPOD with a RAG assistant over Malaysian tax documents. The dashboard shows contacts, open pipeline and recent activity." |
| Leads → search "tan", filter Lead (Grace Tan, Tan Mei Ling) → open Azman Hashim from the full list | "Leads with search and status filter. Each lead has its opportunities and an activity timeline." |
| Opportunities → drag a card from Qualified to Proposal | "Opportunities on a Kanban board by stage. Dragging saves the stage." |

### 2. Tax Q&A, the main part (≈ 2 min)

| Show | Say |
|---|---|
| Tax Q&A → click **"Who is exempt from issuing e-Invoices?"** | "Nine public LHDN and RMCD documents: e-Invoice guidelines, Public Rulings and SST guides, chunked by section and embedded into pgvector." |
| The answer | "Every statement has a citation: the document, section and page." |
| Click a citation | "It opens the original PDF on that page, so a rep can check the source before advising a client." |
| Ask **"What is the current service tax rate on legal services?"** | "The knowledge base has a 2021 guide that says 6% and a 2026 guide recording the rise to 8%. Passages carry their publication date, and the prompt says to prefer the newest, so it gives 8% and mentions the old rate. My evaluation is what found this case." |
| Open **Show retrieved passages** | "These are the 10 passages the model read, with similarity scores and which ones it cited. Useful for debugging retrieval." |
| Set **Search in: SST**, ask **"Do intra-group management fees attract service tax?"** | "The metadata filter limits the search to one document type." |
| Click **"What is the corporate income tax rate in Singapore?"** | "Not in the documents, so it says so instead of answering from the model's own memory. Off-topic questions are stopped by a similarity floor; near-domain ones like this by the model's explicit `answered: false` flag; and an answer with no valid citation is never shown." |

### 3. Meeting Notes, the add-on (≈ 1 min)

| Show | Say |
|---|---|
| Meeting Notes → **"Follow-up with an existing lead"** → Extract | "Option B: paste meeting notes, and Gemini extracts people, action items and opportunities under a strict JSON schema." |
| The review form: matched contact, evidence quotes, due dates | "Each item shows the quote it came from, checked by the server. People are matched to existing contacts by rules, not by the AI, and 'next Friday' is worked out from the meeting date." |
| Edit one field → **Confirm and save** → open the lead | "Nothing is saved until I confirm, then it's one transaction. The contact, deal and action items now appear on the lead page." |

### 4. Evaluation (≈ 30 s)

| Show | Say |
|---|---|
| Terminal: `npm run eval` | "Thirteen test questions with expected documents and pages: the right document is first for 9 of 10, and in the passages the model reads for all 10. Answers cited the expected document 10 out of 10 times and refused all 3 out-of-scope questions. The write-up in ARCHITECTURE.md covers what didn't work: hybrid search was worse and reranking didn't help." |
| README / ARCHITECTURE.md on GitHub (2 s) | "Setup is in the README; the design, data model and evaluation are in ARCHITECTURE.md." |

## After recording

- Upload as **unlisted** (YouTube or Loom) and check it plays in a private window.
- Put the link at the top of the README (replace "_link added after recording_").
