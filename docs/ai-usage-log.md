# AI Usage Log (raw)

Running log of AI-assisted work, used to write `AI_USAGE.md` at submission. Log as you go: the brief asks for a **real** prompt, the output, what you changed, and why.

| Date | Tool | Task | Prompt (summary or link) | What it produced | What I changed / why | Helped or fell short? |
|---|---|---|---|---|---|---|
| 2026-11-03 | Claude Code (Conductor) | Overall project planning | "Given this case study, let's start planning the overview… deeper planning must happen per milestone, not everything at the start. Create documents if needed." | `docs/PLAN.md` (priorities, interpretations, stack proposal, 7 milestones, open decisions), milestone template, this log | _fill in_ | _fill in_ |
| 2026-11-03 | Claude Code (Conductor) | Simplify stack | "Could we make the proposed stack simpler? Like everything local if possible? Explain why or why not." | Cut Supabase/Vercel/ORM; Docker pgvector + raw SQL + Gemini; reasons for rejecting Ollama, PGlite, SQLite | _fill in_ | _fill in_ |
| 2026-11-03 | Claude Code (Conductor) | M0 milestone plan | "write docs/milestones/M0-foundations.md" | `docs/milestones/M0-foundations.md`: small decisions (IDs, enums, money, cascade, port), Mermaid component diagram + ERD, schema.sql sketch, repo layout, env vars, tasks, exit criteria | _fill in_ | _fill in_ |

## Candidate examples for AI_USAGE.md

Note anything that would make a good "real example": the AI got something wrong, you had to correct a design, or a prompt worked unusually well.

- **Contact delete behaviour (M0).** AI recommended hard delete with cascade as simplest. I asked whether archiving (soft delete) was more realistic; AI agreed (real CRMs use a recycle bin; PDPA still needs a hard purge) and laid out its real cost (filters on every query, archived contacts' opportunities in dashboard totals, restore UI). Kept cascade for scope; moved archive design to "What I would do differently". Example of using AI to weigh a trade-off rather than just accept its default.
