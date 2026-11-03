# AI Usage Log (raw)

Running log of AI-assisted work, used to write `AI_USAGE.md` at submission. Log as you go: the brief asks for a **real** prompt, the output, what you changed, and why.

| Date | Tool | Task | Prompt (summary or link) | What it produced | What I changed / why | Helped or fell short? |
|---|---|---|---|---|---|---|
| 2026-11-03 | Claude Code (Conductor) | Overall project planning | "Given this case study, let's start planning the overview… deeper planning must happen per milestone, not everything at the start. Create documents if needed." | `docs/PLAN.md` (priorities, interpretations, stack proposal, 7 milestones, open decisions), milestone template, this log | _fill in_ | _fill in_ |
| 2026-11-03 | Claude Code (Conductor) | Simplify stack | "Could we make the proposed stack simpler? Like everything local if possible? Explain why or why not." | Cut Supabase/Vercel/ORM; Docker pgvector + raw SQL + Gemini; reasons for rejecting Ollama, PGlite, SQLite | _fill in_ | _fill in_ |
| 2026-11-03 | Claude Code (Conductor) | M0 milestone plan | "write docs/milestones/M0-foundations.md" | `docs/milestones/M0-foundations.md`: small decisions (IDs, enums, money, cascade, port), Mermaid component diagram + ERD, schema.sql sketch, repo layout, env vars, tasks, exit criteria | _fill in_ | _fill in_ |
| 2026-11-03 → 04 | Claude Code (Conductor) | M0 build: scaffold, DB, Gemini check | "lets start M0" | Design commit first, then Next.js 16 + shadcn scaffold, Docker pgvector schema, `lib/db.ts`, `lib/llm.ts`, `check:gemini`, health page. Probed Gemini models when the planned one was retired | _fill in_ | _fill in_ |

## Candidate examples for AI_USAGE.md

Note anything that would make a good "real example": the AI got something wrong, you had to correct a design, or a prompt worked unusually well.

- **Contact delete behaviour (M0).** AI recommended hard delete with cascade as simplest. I asked whether archiving (soft delete) was more realistic; AI agreed (real CRMs use a recycle bin; PDPA still needs a hard purge) and laid out its real cost (filters on every query, archived contacts' opportunities in dashboard totals, restore UI). Kept cascade for scope; moved archive design to "What I would do differently". Example of using AI to weigh a trade-off rather than just accept its default.
- **Planned model retired on day one (M0).** The plan said `gemini-2.5-flash`, flagged "verify model IDs in M0" as a risk, and built `check:gemini` to list models. It returned 404 "no longer available to new users"; the suggested replacement (`gemini-3.8-flash`) was overloaded (503). AI probed each Flash model with retries off and picked the one that answered. Good example of planning for a known AI-tooling weakness (knowledge cutoff) instead of trusting the model's memory.
- **Bug found by looking, not by tooling (M0).** lint, typecheck and build all passed, but a screenshot showed a serif font: shadcn's init had written a self-referencing CSS variable. Shows why "verify in the real app" matters with AI-generated scaffolds.
