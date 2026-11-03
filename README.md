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
npm run dev                 # http://localhost:3000
```

If port 5433 is taken, set `DB_PORT` in `.env` and use the same port in `DATABASE_URL`.

## Using the CRM

- **Dashboard** (`/`): total contacts, open opportunities, total value (RM) and the latest activity.
- **Leads** (`/leads`): search by name, email, company or phone; filter by status; create, edit and delete. A lead's page shows their opportunities and activity timeline, where you can log calls, emails, meetings and notes.
- **Opportunities** (`/opportunities`): a Kanban board by stage. Drag a card to change its stage, or use the stage dropdown on the opportunity's page.

`npm run seed` replaces all CRM data (it never touches ingested documents). [System status](http://localhost:3000/status) shows whether the app can reach the database. `npm run check:gemini` checks your API key, lists the models it can use, and makes one embedding and one chat call.

## Database

The schema lives in [`db/schema.sql`](db/schema.sql) and is loaded only when the container starts with an empty volume. After changing it:

```bash
npm run db:reset            # drops all data and reloads the schema
```

`npm run db:psql` opens a psql shell.
