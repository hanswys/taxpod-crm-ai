// Ask the Tax Q&A pipeline from the terminal: npm run ask -- "question" [--type sst] [--k 6]
// Prints the retrieved passages and scores, then the answer with citations. Same code as /ask.
import { parseArgs } from "node:util";
import { sql } from "@/lib/db";
import { ask } from "@/lib/rag/answer";
import { pageLabel } from "@/lib/rag/prompt";
import { TOP_K } from "@/lib/rag/retrieve";

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { type: { type: "string" }, k: { type: "string" } },
  });
  const question = positionals.join(" ");
  if (!question) {
    console.error('Usage: npm run ask -- "Who is exempt from issuing e-Invoices?" [--type e_invoice|public_ruling|sst] [--k 6]');
    process.exit(1);
  }

  const result = await ask({ question, docType: values.type }, { k: values.k ? Number(values.k) : TOP_K });

  if (result.kind === "error") {
    console.log(`\nERROR: ${result.message}`);
    process.exitCode = 1;
    return;
  }

  console.log("\nRetrieved passages:");
  result.passages.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.similarity.toFixed(3)}  ${p.shortTitle} · ${p.section ?? "–"} · ${pageLabel(p)}`);
  });

  if (result.kind === "not_found") {
    console.log(`\nNOT FOUND (${result.reason}${result.model ? `, ${result.model}` : ""}, ${result.ms} ms)\n${result.message}`);
    return;
  }

  console.log(`\nANSWER (${result.model}, ${result.ms} ms)\n${result.answer}\n\nSources:`);
  for (const c of result.citations) {
    console.log(`  [${c.n}] ${c.shortTitle} · ${c.section ?? "–"} · ${pageLabel(c)}  (passage ${c.rank})  ${c.href}`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
