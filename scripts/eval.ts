// Retrieval evaluation: npm run eval [-- --mode vector|hybrid|rerank] [--answers] [--only q01,q07]
//
// Runs eval/questions.json through the same code as /ask and reports, for the answerable
// questions, how often a passage from the expected document (doc hit) or the expected pages
// (section hit) is in the top k. With --answers it also runs ask() on every question and
// checks the outcome: answered with a citation to an expected document, or refused.
// Full runs write eval/results/<mode>[-answers].md; --only runs just print.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parseArgs } from "node:util";
import { z } from "zod";
import { sql } from "@/lib/db";
import { chatModel, embed, embedModel, fallbackChatModel, rerankModel } from "@/lib/llm";
import { ask, SIMILARITY_FLOOR, type AskResult } from "@/lib/rag/answer";
import { pageLabel } from "@/lib/rag/prompt";
import { rankPassages, RETRIEVAL_MODE, RETRIEVAL_MODES, TOP_K, type Passage, type RetrievalMode } from "@/lib/rag/retrieve";
import { CHUNKER_VERSION, SOURCES } from "@/lib/rag/sources";

const KS = [1, 3, 6, 10] as const;
const DEPTH = 10; // passages retrieved per question; ranks beyond this count as a miss
// Free tier: 5 generate requests a minute per model. 13 s apart stays under it.
const CALL_SPACING_MS = 13_000;

const slugs = new Set(SOURCES.map((s) => s.slug));
const questionsSchema = z
  .array(
    z.object({
      id: z.string(),
      question: z.string().min(3),
      // Any one of these counts as a hit. Empty = the system should refuse.
      expected: z.array(
        z.object({
          slug: z.string().refine((s) => slugs.has(s), { message: "not a slug in lib/rag/sources.ts" }),
          pages: z.tuple([z.number().int(), z.number().int()]), // inclusive range, for section hit
        }),
      ),
      note: z.string().optional(),
    }),
  )
  .refine((qs) => new Set(qs.map((q) => q.id)).size === qs.length, { message: "duplicate question ids" });
type Question = z.infer<typeof questionsSchema>[number];

type RetrievalRow = {
  q: Question;
  passages: Passage[];
  docRank: number | null; // 1-based rank of the first passage from an expected document
  sectionRank: number | null; // same, but the passage must also overlap the expected pages
  top1: number; // best cosine similarity among the retrieved passages
};

type AnswerRow = { q: Question; result: AskResult; pass: boolean; citedExpected: boolean | null };

async function main() {
  const { values } = parseArgs({
    options: {
      mode: { type: "string", default: RETRIEVAL_MODE },
      answers: { type: "boolean", default: false },
      only: { type: "string" },
    },
  });
  const mode = values.mode as RetrievalMode;
  if (!RETRIEVAL_MODES.includes(mode)) throw new Error(`--mode must be one of: ${RETRIEVAL_MODES.join(", ")}`);

  const all = questionsSchema.parse(JSON.parse(readFileSync("eval/questions.json", "utf8")));
  const only = values.only?.split(",").map((s) => s.trim());
  const questions = only ? all.filter((q) => only.includes(q.id)) : all;
  if (questions.length === 0) throw new Error(`No questions match --only ${values.only}`);

  // Retrieval: one embedding call for all questions, then a search per question.
  const vectors = await embed(questions.map((q) => q.question), "RETRIEVAL_QUERY");
  const retrieval: RetrievalRow[] = [];
  for (const [i, q] of questions.entries()) {
    if (mode === "rerank" && i > 0) await pause(); // one Flash-Lite call per question
    // strict: if a rerank call fails, stop rather than report vector order as rerank results.
    const passages = await rankPassages(q.question, vectors[i], { k: DEPTH, mode, strict: true });
    retrieval.push(score(q, passages));
    process.stdout.write(".");
  }
  console.log();

  let answers: AnswerRow[] | undefined;
  if (values.answers) {
    answers = [];
    for (const q of questions) {
      const result = await ask({ question: q.question }, { mode });
      answers.push(judge(q, result));
      console.log(`  ${q.id} ${describeOutcome(result)}`);
      if (result.kind !== "not_found" || result.model) await pause(); // only LLM calls count against the limit
    }
  }

  const report = await render(mode, retrieval, answers);
  console.log(`\n${report}`);
  if (!only) {
    mkdirSync("eval/results", { recursive: true });
    const file = `eval/results/${mode}${answers ? "-answers" : ""}.md`;
    writeFileSync(file, report);
    console.log(`Wrote ${file}`);
  }
}

function score(q: Question, passages: Passage[]): RetrievalRow {
  const rankOf = (match: (p: Passage) => boolean) => {
    const i = passages.findIndex(match);
    return i === -1 ? null : i + 1;
  };
  return {
    q,
    passages,
    docRank: rankOf((p) => q.expected.some((e) => e.slug === p.slug)),
    sectionRank: rankOf((p) =>
      q.expected.some((e) => e.slug === p.slug && p.pageStart <= e.pages[1] && p.pageEnd >= e.pages[0]),
    ),
    top1: Math.max(...passages.map((p) => p.similarity)),
  };
}

function judge(q: Question, result: AskResult): AnswerRow {
  if (q.expected.length === 0) return { q, result, pass: result.kind === "not_found", citedExpected: null };
  const citedExpected =
    result.kind === "answer" && result.citations.some((c) => q.expected.some((e) => slugOf(c.href) === e.slug));
  return { q, result, pass: citedExpected, citedExpected };
}

// "/documents/pr-8-2025.pdf#page=19" → "pr-8-2025"
function slugOf(href: string): string | undefined {
  const file = href.split("#")[0].replace(/^\//, "");
  return SOURCES.find((s) => `documents/${s.file}` === file)?.slug;
}

async function render(mode: RetrievalMode, rows: RetrievalRow[], answers?: AnswerRow[]): Promise<string> {
  const [{ chunks }] = await sql<{ chunks: number }[]>`select count(*) as chunks from chunks`;
  const answerable = rows.filter((r) => r.q.expected.length > 0);
  const refusals = rows.filter((r) => r.q.expected.length === 0);
  const hits = (rank: (r: RetrievalRow) => number | null, k: number) =>
    answerable.filter((r) => (rank(r) ?? Infinity) <= k).length;
  const mrr = answerable.reduce((sum, r) => sum + (r.docRank ? 1 / r.docRank : 0), 0) / (answerable.length || 1);
  const n = answerable.length;

  const lines = [
    `# Eval results: ${mode}${answers ? " + answers" : ""}`,
    "",
    `Run ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC by \`npm run eval -- --mode ${mode}${answers ? " --answers" : ""}\`. ` +
      `${chunks} chunks (chunker v${CHUNKER_VERSION}), embeddings \`${embedModel()}\`, ` +
      `${answers ? `answers \`${chatModel()}\` (fallback \`${fallbackChatModel()}\`), ` : ""}` +
      `${mode === "rerank" ? `rerank \`${rerankModel()}\` (fallback \`${fallbackChatModel()}\`), ` : ""}production k = ${TOP_K}, similarity floor ${SIMILARITY_FLOOR}.`,
    "",
    "## Retrieval",
    "",
    `${n} answerable questions. A **doc hit @k** means a passage from an expected document is in the top k; a **section hit @k** means it also overlaps the expected pages.`,
    "",
    `| | ${KS.map((k) => `@${k}`).join(" | ")} |`,
    `|---|${KS.map(() => "---").join("|")}|`,
    `| Doc hit | ${KS.map((k) => `${hits((r) => r.docRank, k)}/${n}`).join(" | ")} |`,
    `| Section hit | ${KS.map((k) => `${hits((r) => r.sectionRank, k)}/${n}`).join(" | ")} |`,
    "",
    `**MRR** (mean of 1 / doc rank, 0 if not in the top ${DEPTH}): ${mrr.toFixed(3)}`,
    "",
    `**Best similarity**: answerable questions ${range(answerable.map((r) => r.top1))}; refusal questions ${range(refusals.map((r) => r.top1))}.`,
    "",
    "| id | Question | Expected | Doc rank | Section rank | Best sim. | Top passage |",
    "|---|---|---|---|---|---|---|",
    ...rows.map((r) => {
      const top = r.passages[0];
      const expected = r.q.expected.map((e) => `${e.slug} p. ${e.pages[0]}–${e.pages[1]}`).join(" or ") || "_refuse_";
      const rank = (x: number | null) => (r.q.expected.length === 0 ? "–" : (x ?? "miss"));
      return `| ${r.q.id} | ${r.q.question} | ${expected} | ${rank(r.docRank)} | ${rank(r.sectionRank)} | ${r.top1.toFixed(3)} | ${top ? `${top.shortTitle} · ${top.section ?? "–"} · ${pageLabel(top)}` : "–"} |`;
    }),
  ];

  if (answers) {
    const passed = (rows: AnswerRow[]) => `${rows.filter((a) => a.pass).length}/${rows.length}`;
    lines.push(
      "",
      "## Answers",
      "",
      `Answered with a citation to an expected document: **${passed(answers.filter((a) => a.q.expected.length > 0))}**. ` +
        `Refused when they should be: **${passed(answers.filter((a) => a.q.expected.length === 0))}**.`,
      "",
      "| id | Should | Outcome | Cites expected doc | Model | Time | Pass |",
      "|---|---|---|---|---|---|---|",
      ...answers.map((a) => {
        const r = a.result;
        const model = r.kind === "error" ? "–" : (r.model ?? "–");
        const ms = r.kind === "error" ? "–" : `${(r.ms / 1000).toFixed(1)} s`;
        const cites = a.citedExpected === null ? "–" : a.citedExpected ? "yes" : "no";
        return `| ${a.q.id} | ${a.q.expected.length ? "answer" : "refuse"} | ${describeOutcome(r)} | ${cites} | ${model} | ${ms} | ${a.pass ? "✅" : "❌"} |`;
      }),
      "",
      "### Answer text (for the faithfulness check)",
      ...answers.flatMap((a) => {
        const r = a.result;
        const body =
          r.kind === "answer"
            ? [r.answer, "", ...r.citations.map((c) => `- [${c.n}] ${c.shortTitle} · ${c.section ?? "–"} · ${pageLabel(c)} (passage ${c.rank})`)]
            : [r.kind === "not_found" ? `_Not found (${r.reason})_: ${r.message}` : `_Error_: ${r.message}`];
        return ["", `**${a.q.id}. ${a.q.question}**`, "", ...body];
      }),
    );
  }
  return lines.join("\n") + "\n";
}

function describeOutcome(r: AskResult): string {
  if (r.kind === "answer") return `answer (${r.citations.length} citation${r.citations.length === 1 ? "" : "s"})`;
  if (r.kind === "not_found") return `not found: ${r.reason}`;
  return `error: ${r.message}`;
}

function range(values: number[]): string {
  return values.length ? `${Math.min(...values).toFixed(3)}–${Math.max(...values).toFixed(3)}` : "–";
}

const pause = () => new Promise((resolve) => setTimeout(resolve, CALL_SPACING_MS));

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
