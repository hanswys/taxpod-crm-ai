# M1 — Core CRM

**Status:** Done
**Dates:** 2026-11-04 → 2026-11-05
**Branch / PR:** `hanswys/5qas9`

## 1. Goal

The CRM half of the brief (Part 1) works end to end against seed data: Leads CRUD with search and status filter, Opportunities CRUD linked to a contact and shown as a Kanban board grouped by stage, an Activity Log against a contact or opportunity, and a Dashboard with total contacts, open opportunities, total value (RM) and a recent activity feed.

Built plainly and quickly (PLAN §1). No AI in this milestone. The one forward-looking concern is M5: the meeting-notes extractor will create/update contacts and log activities, so the validation schemas and query functions written here should be reusable from there.

## 2. Decisions

All five open choices (validation, dialogs, drag-and-drop, feed, unique email) were agreed on 2026-11-04 as recommended.

| Decision | Choice | Why | Alternatives considered |
|---|---|---|---|
| Mutations | **Server Actions** + `useActionState` for form errors; call `refresh()` after each write, `redirect()` after create/delete | Next 16's built-in path (checked in bundled docs). No API routes to write or document for CRUD. | Route handlers + `fetch` from client components (more code, no gain for a single-user app) |
| Caching | **No `use cache` for CRM reads.** Every CRM page is dynamic (`connection()` inside `<Suspense>`, as in M0) | Data is tiny and must be fresh after every edit; cache tags would add invalidation bugs for no benefit | `use cache` + `cacheTag` + `updateTag` per entity |
| Validation | **Decided: add `zod`.** One schema per entity in `lib/crm/schemas.ts`, used by the server actions | Same schemas can be turned into JSON Schema (`z.toJSONSchema`) for Gemini's structured output in M5, so the extractor and the forms validate identically | Hand-written checks (no dep, but duplicated in M5) |
| `bigint` / `numeric` from postgres.js | **Parse once in `lib/db.ts`** via the driver's `types` option: int8 (ids, `count(*)`) and numeric (`value_rm`, `sum()`) → JS `number` | M0 risk: the driver returns both as strings. Doing it at the driver means no query can forget. All values are far below 2^53. | `Number()` in each query function; SQL casts (`::int`, `::float8`) in every query |
| Create / edit UI | **Decided: dialogs.** "New lead" / "Edit" open a dialog on the list or detail page; delete uses a confirm dialog | Fewer routes, feels like a CRM, and the form component is shared between create and edit | Dedicated `/leads/new` and `/leads/[id]/edit` pages (simpler, more page loads) |
| Detail pages | `/leads/[id]` and `/opportunities/[id]` | Somewhere to show a contact's opportunities and activity timeline and to log activities. Dashboard feed items link to them. | Side sheets from the list/board (no URL to link to) |
| Search & filter | URL params `?q=&status=`; server-side `ilike` over name, email, company, phone; debounced input updates the URL | Shareable/back-button friendly; no client state; trivially correct for ~tens of rows | Client-side filtering of a full list; Postgres full-text search (overkill) |
| Pagination | **None**, list capped at 200 rows with a note | Seed is ~15 contacts. Mention in "What I'd do differently". | Offset or keyset pagination |
| Kanban stage change | **Decided: native HTML5 drag-and-drop** with `useOptimistic`, plus a stage `<select>` on the opportunity detail page as the keyboard/touch fallback | No dependency, ~50 lines. Fallback covers accessibility. | `@dnd-kit` (keyboard + touch support, nicer animation, one more dep); no drag, stage select only (simplest, but weak for a "Kanban") |
| Card order within a column | Not persisted; sorted by `updated_at desc` (just-moved cards go to the top) | No `position` column to maintain | `position` column with reordering |
| Logging against an opportunity | Activity stores **both** `opportunity_id` and that opportunity's `contact_id` | Contact timeline is then just `where contact_id = $1`, and covers opportunity activities too. The schema already allows both. | Store only `opportunity_id` and join through opportunities for the contact timeline |
| Activity editing | Create + delete only, no edit | The brief asks to "log" activities. Delete + re-log covers mistakes. | Full edit |
| Activity date | `datetime-local` input defaulting to now; the app uses a fixed time zone, **`Asia/Kuala_Lumpur`**, to parse input and format output | Server and reviewer's machine may be in different zones; one constant avoids off-by-8h dates | Date-only input (loses ordering within a day); browser time zone (server render mismatch) |
| Dashboard feed (deferred from M0) | **Decided: logged `activities` only**, latest 10, each linking to its contact/opportunity | Feed stays meaningful; no events table; M5 extractor writes into the same table so it shows up naturally | Also auto-log system events (contact created, stage changed) as activities or in a separate `events` table |
| Email uniqueness | **Decided: partial unique index** on `lower(email)` where email is not null (schema change → `db:reset`) | M5 needs to match extracted people to existing contacts; a unique email makes "update existing" well-defined. Also blocks obvious duplicates now. | No constraint (M5 matches by name/email heuristically and must handle duplicates) |
| Seed data | `npm run seed` (`scripts/seed.ts`): truncates **CRM tables only** (`restart identity`), inserts hand-written fixtures. Activity dates are relative to now so the feed looks recent | Deterministic, no faker dependency, never touches `documents`/`chunks` from ingestion | `@faker-js/faker` (random, less believable for a demo); seed inside `schema.sql` (would be re-run only on reset) |
| Money display | `formatRM()` in `lib/format.ts`: `Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' })` → `RM 20,000.00` | One place; matches the brief's "RM" | Hand-rolled formatting |
| Tests | No unit test framework in M1. Verify with the checklist in §5 + `lint` / `typecheck` / `build` + a screenshot pass | CRM logic is thin SQL. Testing effort goes to the RAG eval (M4). | Vitest for query functions against the Docker DB |

## 3. Design

### 3.1 Pages

| Route | Content |
|---|---|
| `/` | **Dashboard.** Stat cards: Total contacts (sub-line: N leads · N prospects · N customers), Open opportunities (count + open pipeline RM), Total opportunities value (all stages; sub-line: won RM). Recent activity: latest 10 activities with type icon, description, target link, relative date. |
| `/leads` | Search box + status filter (All / Lead / Prospect / Customer) + "New lead". Table: name, company, email, phone, status badge, updated. Row → detail. Empty state with and without filters. |
| `/leads/[id]` | Contact fields, Edit / Delete. Delete confirm states what goes with it, e.g. "Also deletes 2 opportunities (RM 20,000.00) and 4 activities" (M0 decision A). Opportunities list + "New opportunity" (contact preselected). Activity timeline + "Log activity". |
| `/opportunities` | Kanban: 6 columns New → Contacted → Qualified → Proposal → Won / Lost, each with count + RM total. Card: title, contact name, value. Drag between columns to change stage. "New opportunity" (contact picker). |
| `/opportunities/[id]` | Title, value, stage select, contact link, Edit / Delete. Activity timeline + "Log activity". |
| `/status` | The M0 health page, moved off `/`. Linked from the footer. |

Top nav in `app/layout.tsx`: Dashboard · Leads · Opportunities (· Tax Q&A added in M3).

### 3.2 Code layout

```
app/
  layout.tsx                 + top nav
  page.tsx                   dashboard
  status/page.tsx            M0 health page (moved)
  leads/page.tsx, leads/[id]/page.tsx, leads/actions.ts
  opportunities/page.tsx, opportunities/[id]/page.tsx, opportunities/actions.ts
  activities/actions.ts
components/crm/              contact-form, opportunity-form, activity-form, activity-list,
                             kanban-board, stat-card, confirm-delete, search-filter
lib/crm/
  types.ts                   Status / Stage / ActivityType unions + display labels (single source)
  schemas.ts                 zod schemas (reused by M5)
  contacts.ts                listContacts({ q, status }), getContact, createContact, updateContact,
                             deleteContact, getContactDeleteImpact
  opportunities.ts           listByStage, getOpportunity, create, update, setStage, delete
  activities.ts              listForContact, listForOpportunity, listRecent, create, delete
  dashboard.ts               getDashboardStats (one query)
lib/format.ts                formatRM, formatDate / relative time, APP_TIME_ZONE
scripts/seed.ts              npm run seed
```

Query functions in `lib/crm/*` are plain async functions over `sql` (no `"use server"`), so M5 and scripts can call them directly. Server actions in `app/**/actions.ts` only parse `FormData` with zod, call the query function, then `refresh()` / `redirect()`.

### 3.3 Schema change

```sql
-- M5 matches extracted people to existing contacts by email
create unique index contacts_email_unique on contacts (lower(email)) where email is not null;
```

Server action maps the unique-violation (`23505`) to a field error: "A contact with this email already exists". Empty email input is stored as `null`, not `''`.

### 3.4 Key queries

```sql
-- Leads list
select * from contacts
where ($status::text is null or status = $status)
  and ($q::text is null or name ilike $pat or email ilike $pat or company ilike $pat or phone ilike $pat)
order by updated_at desc
limit 200;
-- $pat = '%' + q with % and _ escaped + '%'

-- Dashboard (one round trip)
select
  (select count(*) from contacts)                                          as total_contacts,
  (select count(*) from contacts where status = 'lead')                    as leads,
  (select count(*) from contacts where status = 'prospect')                as prospects,
  (select count(*) from contacts where status = 'customer')                as customers,
  (select count(*) from opportunities where stage not in ('won','lost'))   as open_count,
  (select coalesce(sum(value_rm),0) from opportunities where stage not in ('won','lost')) as open_value,
  (select coalesce(sum(value_rm),0) from opportunities)                    as total_value,
  (select coalesce(sum(value_rm),0) from opportunities where stage = 'won') as won_value;

-- Recent activity
select a.*, c.name as contact_name, o.title as opportunity_title
from activities a
left join contacts c on c.id = a.contact_id
left join opportunities o on o.id = a.opportunity_id
order by a.occurred_at desc, a.id desc
limit 10;
```

### 3.5 Validation rules (zod)

- **Contact:** name required (trimmed, ≤ 200); email optional, valid format, lower-cased; phone optional free text (≤ 50); company optional; status ∈ enum, default `lead`.
- **Opportunity:** title required; `contact_id` must exist; `value_rm` ≥ 0, ≤ 2 decimals, < 10,000,000,000 (fits `numeric(12,2)`); stage ∈ enum, default `new`.
- **Activity:** type ∈ enum; `occurred_at` valid datetime; description required (≤ 2000); at least one of contact / opportunity (mirrors the DB `CHECK`).

### 3.6 Seed data

About 15 contacts at fictional Malaysian companies (e.g. "Kedai Runcit Seri Mutiara Sdn Bhd", accounting firms, SMEs) spread across all three statuses; about 20 opportunities across all six stages with taxPOD-flavoured titles ("taxPOD corporate licence, 20 seats", "e-Invoice readiness workshop", "SST compliance training"), RM 1,500–60,000; about 30 activities of all four types over the last ~3 weeks, some against opportunities. Gives the dashboard, Kanban and feed realistic content, and gives M5 existing contacts to match against.

## 4. Tasks

**Plumbing**
- [x] Read bundled Next 16 docs for Server Actions, `useActionState`, `refresh`, `redirect`, dynamic params (`params` is a Promise)
- [x] `lib/db.ts`: `types` option parsing int8 + numeric to `number`; update health page if it relied on strings
- [x] Add `zod`; `lib/crm/types.ts`, `lib/crm/schemas.ts`, `lib/format.ts`
- [x] Unique email index in `schema.sql` (update ARCHITECTURE.md data model note)
- [x] shadcn components: dialog, alert-dialog, input, label, textarea, select, table, sonner (check Base UI APIs: this project uses the `base-nova` style, not Radix)
- [x] Layout with top nav; move health page to `/status`

**Leads**
- [x] `lib/crm/contacts.ts` queries
- [x] `/leads` list with search (debounced, URL param) + status filter + empty states
- [x] Create / edit dialog (shared form, field errors, duplicate email error)
- [x] `/leads/[id]` detail; delete with impact counts in confirm dialog

**Opportunities**
- [x] `lib/crm/opportunities.ts` queries
- [x] `/opportunities` Kanban with column count + RM totals
- [x] Drag-and-drop stage change with optimistic update; revert + toast on failure
- [x] Create / edit dialog with contact picker (preselected when opened from a contact)
- [x] `/opportunities/[id]` detail with stage select, edit, delete

**Activities**
- [x] `lib/crm/activities.ts` queries
- [x] Log activity form (type, datetime-local in MYT, description) on both detail pages
- [x] Timeline component, newest first, with delete

**Dashboard**
- [x] `getDashboardStats` + recent activity query
- [x] Stat cards + feed with links

**Seed & housekeeping**
- [x] `scripts/seed.ts` + `npm run seed`; README step after `db:up`
- [x] ARCHITECTURE.md: note the dashboard metric definitions, cascade-delete UX, no pagination (→ "What I would do differently")
- [x] AI usage log entries for M1

## 5. Exit criteria / how to verify

- [x] `npm run db:reset && npm run seed` → dashboard shows non-zero counts that match `db:psql` queries by hand
- [x] Leads: create, edit, delete a contact; search by partial name/company/email; filter by each status; search + filter combined; duplicate email shows a field error
- [x] Deleting a contact with opportunities shows the impact counts, then removes its opportunities and activities (Kanban and dashboard totals update)
- [x] Opportunities: create from the board and from a contact; edit value; drag a card New → Proposal → Won and see column totals, dashboard open count/value change; reload keeps the stage
- [x] Stage select on the detail page works without drag
- [x] Activities: log one against a contact and one against an opportunity; both show on the contact timeline and in the dashboard feed in the right order; dates render in MYT
- [x] Invalid input (empty name, negative value, bad email) shows field errors and writes nothing _(negative value and duplicate email checked in the browser; empty name and bad email are stopped by the browser's `required` / `type=email` first, so the server-side zod rules were checked directly against the schemas)_
- [x] `npm run lint`, `npm run typecheck`, `npm run build` pass
- [x] Screenshot pass of every page (catch layout issues lint can't, per M0 lesson)

## 6. Risks & open questions

- **Next 16 + Cache Components behaviour around Server Actions.** Assumed: `refresh()` re-renders dynamic pages after a write. Verify on the first form before building the rest.
- **Base UI vs Radix.** shadcn `base-nova` components wrap Base UI; Select/Dialog props differ from what most examples (and the AI's training data) show. Check the generated component files rather than guessing.
- **HTML5 drag-and-drop** doesn't work on touch screens and has no keyboard support; the stage select is the fallback. Switch to `@dnd-kit` only if it feels broken in the demo.
- **Time zones.** `datetime-local` has no offset; the server must attach `+08:00`. Easy to get wrong silently; the exit check above covers it.
- **Scope creep.** CRM is assessed as "solid, not fancy". Timebox to ~1.5 days; anything beyond §5 goes to "What I would do differently".

## 7. Notes & outcome (fill in at the end)

**Verified** with a scripted Chrome run (playwright-core, kept in `.context/`, not committed): 28 checks covering every §5 item, with zero browser console errors. Plus `lint` / `typecheck` / `build`, dashboard numbers cross-checked with hand-written SQL (15 contacts, 14 open, RM 190,600 open, RM 303,100 total, RM 105,900 won), and a screenshot pass at desktop and mobile widths.

**What changed from the plan / learned**
- **Every route needs its own `loading.tsx`.** One root `loading.tsx` was enough for the first page load and for `next build`, but client-side navigation into `/leads/[id]` etc. logged "uncached data accessed outside of `<Suspense>`" in dev. Next 16 wants a boundary inside each segment that changes. Added route-specific skeletons (`components/crm/page-skeleton.tsx`).
- **`usePathname()` in the nav needs `<Suspense>` too.** `next build` failed on the dynamic routes until the nav was wrapped (fallback = same links, nothing highlighted).
- **`error.tsx` changed in Next 16:** the props are `error: unknown` and `retry()`, not `reset()`. Found by reading the bundled docs; most examples online (and the AI's first draft) use the old API. Naming the component `Error` also shadowed the global `Error`, which broke `instanceof Error`.
- **Next 16 keeps visited pages mounted but hidden** (React Activity). Not a bug, but browser tests have to select visible elements only.
- **Driver-level type parsing works:** postgres.js `types` with int8 + numeric parsers. The `Sql<…>` generic takes the resulting JS types, not the parser config, so the global is typed from the factory's return type.
- **Seed data had activities "in the future"** when run before 10am Malaysia time (fixed: such times move back a day). It also backdates `created_at` / `updated_at` from each record's activities so lists don't all say "just now".
- **Kanban layout:** six columns at 15rem overflowed a 1400px window, and long contact names pushed cards past the column edge. Fixed with 12rem columns and `grid-cols-1` (`minmax(0, 1fr)`) on the card list. Only spotted in screenshots, not by any tool.
- **`DB_PORT` env var added** (compose default stays 5433). Another workspace's Postgres container already held 5433; a reviewer with a local Postgres on 5433 would hit the same thing.
- shadcn `sonner` pulled in `next-themes`; removed (no theme switching), toaster fixed to light.

**Follow-ups**
- M5 can reuse `contactInput` / `activityInput` (zod → JSON Schema for Gemini structured output) and `createContact` / `createActivity` directly; email is the match key.
- M3: add "Tax Q&A" to `LINKS` in `components/crm/nav-links.tsx`.
