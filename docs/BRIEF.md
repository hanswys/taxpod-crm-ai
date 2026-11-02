# Case Study Brief (verbatim)

> Source of truth for requirements. Do not edit — record interpretations in `docs/PLAN.md`.

Case Study for Software Engineer (Full Stack & AI
Integration): Building a CRM System with AI Capabilities
Background:
YYC taxPOD is Malaysia's leading tax e-learning platform providing comprehensive solutions for
professionals and businesses to navigate tax laws, SST, e-invoicing, and more. Our ecosystem
includes a web platform, mobile application, and an AI-powered knowledge assistant (Zen AI). As
we scale, we are building internal CRM capabilities to manage client relationships, sales pipelines,
and engagement activities across the business. This case study reflects real work you would own as
part of our engineering team.
Your Tasks:
You are asked to design, architect, and build a lightweight CRM system with a meaningful AI
integration component. You are expected to use AI-assisted development tools (e.g., Claude Code,
Cursor, GitHub Copilot, Google AI Studio) throughout your development process. We are evaluating
not just what you build, but how you think, how you design, and how effectively you leverage AI as
a development tool.
Part 1 — Core CRM Modules:
Leads: Create, view, edit, and delete leads. Fields: Name, Email, Phone, Company, and Status (Lead /
Prospect / Customer). Include search and filter by status.
Opportunities: Associate opportunity with contacts. Fields: Title, Value (RM), and Stage (New →
Contacted → Qualified → Proposal → Won / Lost). Display opportunities in a Kanban board or list
view grouped by stage.
Dashboard: Total contacts, open opportunities, total opportunities value (RM), and a recent
activity feed.
Activity Log (optional unless you choose Option B): Log activities against a contact or
opportunity. Fields: Type (Call / Email / Meeting / Note), Date, Description. If you are short on time,
skip this and spend the effort on the RAG module.
Part 2 — Mandatory AI Integration (RAG):
You must implement the RAG module below using a real LLM API (Anthropic Claude, OpenAI,
Google Gemini, or DeepSeek) and a real embedding model. No mocked responses - the prompts,
embedding calls and LLM calls must be visible in your code. You may then add ONE of Options A-C
as an optional extra if time allows; the RAG module is what we will assess most closely.
Mandatory - Tax Document Q&A (RAG): Build a Q&A feature over Malaysian tax documents. (1)
Knowledge base: ingest at least 5 publicly available documents (e.g. LHDN public rulings, SST
guides, e-invoicing guidelines; PDF or HTML). (2) Pipeline: parse, chunk, embed and store the
chunks in a vector database. Preferred: Supabase/PostgreSQL with pgvector; other vector stores
are acceptable if justified. (3) Retrieval: top-k similarity search, with a metadata filter or a

reranking step as a bonus. (4) Answering: pass the retrieved chunks to the LLM and return an
answer with citations (document name and page/section). If the answer is not in the retrieved
context, the system must say so rather than guess. (5) Evaluation: write 8-10 test questions with
the expected source document, run them, and report your retrieval hit rate and what you learned.
(6) Simple UI: a chat or search box in the web app. You may link it to the CRM (e.g. a sales rep
asking tax questions about a client), but this is not required.
Optional Add-on Option A - CRM Copilot (Natural Language Query): A chat interface where the
user can ask questions about their CRM data in plain English — for example: "Which prospects
haven't been contacted in 2 weeks?" or "Summarise all opportunities above RM 10,000 in the
Proposal stage." The system retrieves the relevant records and passes them as context to the LLM
to generate a response.
Optional Add-on Option B - Meeting Notes Extractor: A form where the user pastes raw meeting
notes. The LLM extracts: contacts mentioned (name, company, role), action items with owners and
due dates, and opportunity-relevant information. The system then auto-creates or updates contacts
and logs the extracted activities, with the user reviewing before confirming. Tests: information
extraction, structured output with schema enforcement, human-in-the-loop design.
Optional Add-on Option C - Open Choice: Have a better idea that demonstrates deeper AI
capability? Build it. Justify why your feature is more useful or technically interesting.
Part 3 — Architecture & Engineering Brief:
System Design: Before writing code, design your system. Produce a component diagram showing
how the frontend, backend API, database, and LLM service connect. This can be hand-drawn and
photographed, or created in any diagramming tool.
Data Model: Design the key tables or entities and their relationships. Include this in your
ARCHITECTURE.md.
AI Integration Design: Document your RAG design: document parsing, chunking strategy and size,
embedding model, vector store and index, retrieval settings (top-k, filters, reranking), prompt
design, citation approach, hallucination guard, and error handling. Also document the same for any
optional Option A-C feature.
Stack Choice: Preferred: TypeScript with Next.js/React and Supabase or PostgreSQL (pgvector).
Python is welcome for the ingestion or AI service. You are free to choose another stack (e.g.
ASP.NET Core or Node.js with Angular), but you must justify it in ARCHITECTURE.md.
Authentication is not required - a single hardcoded user is sufficient.
Deliverables:
Code: Submit a GitHub repository or ZIP file. The project must run locally by following your
README.md. Use .env.example for environment variables — do not commit real API keys.
README.md: Step-by-step instructions to run the project locally, including how to ingest the
documents. Describe the RAG module and any optional feature, and how to trigger them. A
deployed link or a 3-5 minute screen recording of the working app is strongly encouraged.

ARCHITECTURE.md: System component diagram, data model, RAG and AI integration design, your
evaluation results, and a candid "What I would do differently with more time" section.
AI_USAGE.md (Required): Document which AI tools you used and what for. Include one real
example: paste an actual prompt you gave the AI, the output you received, what you changed, and
why. Explain where AI helped most and where it fell short.
Submission Guidelines:
Submit your GitHub repository link or ZIP file within 7 calendar days from the date this brief is
issued. Email your submission to your HR contact with the subject line: [Your Full Name] — CRM
Assessment Submission.
If you require a free LLM API key, Google AI Studio (Gemini Flash) offers a free tier with no credit
card required. You may also use the free tiers of OpenAI or Anthropic if you have access. Be
prepared to present and walk through your work, including your architecture decisions and AI
usage, during the technical interview.