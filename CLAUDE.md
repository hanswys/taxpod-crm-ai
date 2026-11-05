# CLAUDE.md

Take-home case study: a lightweight CRM with a RAG Q&A module over Malaysian tax documents.

- Requirements: `docs/BRIEF.md` (verbatim, don't edit). Gitignored since M6 so the case study isn't published with the repo; if it's missing, ask the user for it
- Overall plan, priorities, milestones, open decisions: `docs/PLAN.md`
- Per-milestone detailed plans: `docs/milestones/MX-*.md`

## Workflow

- Plan one milestone at a time. When starting a milestone, create `docs/milestones/MX-<slug>.md` from `_TEMPLATE.md` and agree on it before coding. Don't plan later milestones in detail.
- The RAG module is what gets assessed most closely. Keep the CRM simple.
- Log notable AI interactions in `docs/ai-usage-log.md` (needed for the required AI_USAGE.md).
- Never commit real API keys; update `.env.example` when adding env vars.
