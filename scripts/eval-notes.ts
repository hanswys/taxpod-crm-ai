// Meeting Notes extraction check: npm run eval:notes [-- --only s1,s3]
//
// Runs each sample in eval/notes.json through the same extract() as /notes (without saving a
// meeting_notes row) and compares the draft with what a person would pull out of the notes:
// contacts (and their company, role, email, match), taxPOD staff, action items (owner, due date)
// and opportunities (value). Reports found / missed / extra, plus the grounding checks' flags.
// Full runs write eval/results/notes.md. Each run costs one generate call per sample.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { z } from "zod";
import { sql } from "@/lib/db";
import { chatModel, notesModel } from "@/lib/llm";
import { extract } from "@/lib/notes/extract";
import type { Draft } from "@/lib/notes/schema";

// Free tier: 5 generate requests a minute per model. 13 s apart stays under it.
const CALL_SPACING_MS = 13_000;

const nullableText = z.string().nullable();
const samplesSchema = z.array(
  z.object({
    id: z.string(),
    title: z.string(),
    meetingAt: z.string(),
    notes: z.string(),
    expected: z.object({
      contacts: z.array(z.object({ name: z.string(), company: nullableText, role: nullableText, email: nullableText, match: nullableText })),
      internal: z.array(z.string()),
      actionItems: z.array(z.object({ keywords: z.array(z.string()), owner: nullableText, dueDate: nullableText })),
      // valueRm: a list = any of these is acceptable (e.g. a range in the notes: either end, or null).
      opportunities: z.array(z.object({ keywords: z.array(z.string()), valueRm: z.union([z.number().nullable(), z.array(z.number().nullable())]) })),
    }),
  }),
);
type Sample = z.infer<typeof samplesSchema>[number];

const words = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
/** "Ravi" ~ "Ravi Chandran", "Encik Roslan Hamid" ~ "Roslan Hamid": every word of the shorter name is in the longer. */
const sameName = (a: string, b: string) => {
  const [x, y] = [words(a), words(b)];
  const [short, long] = x.length <= y.length ? [x, new Set(y)] : [y, new Set(x)];
  return short.length > 0 && short.every((w) => long.has(w));
};
const contains = (haystack: string | null, needle: string) => !!haystack && haystack.toLowerCase().includes(needle.toLowerCase());

type Score = { found: number; expected: number; extra: number; fields: number; fieldsChecked: number; notes: string[] };
const score = (): Score => ({ found: 0, expected: 0, extra: 0, fields: 0, fieldsChecked: 0, notes: [] });

function grade(sample: Sample, draft: Draft, names: Map<number, string>) {
  const e = sample.expected;
  const people = score();
  const used = new Set<number>();
  for (const want of e.contacts) {
    people.expected++;
    const i = draft.contacts.findIndex((c, j) => !used.has(j) && sameName(c.fields.name, want.name));
    if (i < 0) {
      people.notes.push(`missed contact ${want.name}`);
      continue;
    }
    used.add(i);
    people.found++;
    const got = draft.contacts[i];
    const checks: [string, boolean][] = [];
    if (want.company) checks.push([`company "${got.fields.company}"`, contains(got.fields.company, want.company)]);
    if (want.role) checks.push([`role "${got.fields.role}"`, contains(got.fields.role, want.role)]);
    checks.push([`email "${got.fields.email}"`, (got.fields.email ?? null) === want.email]);
    const matched = got.match ? names.get(got.match.contactId) ?? null : null;
    checks.push([`match "${matched}"`, matched === want.match]);
    for (const [label, ok] of checks) {
      people.fieldsChecked++;
      if (ok) people.fields++;
      else people.notes.push(`${want.name}: ${label}`);
    }
  }
  draft.contacts.forEach((c, j) => {
    if (used.has(j)) return;
    people.extra++;
    people.notes.push(`extra contact ${c.fields.name}${e.internal.some((n) => sameName(n, c.fields.name)) ? " (taxPOD staff, should be internal)" : ""}`);
  });

  const staff = score();
  for (const name of e.internal) {
    staff.expected++;
    if (draft.internal.some((p) => sameName(p.name, name))) staff.found++;
    else staff.notes.push(`${name} not marked as taxPOD staff`);
  }

  const items = score();
  const usedItems = new Set<number>();
  for (const want of e.actionItems) {
    items.expected++;
    const i = draft.actionItems.findIndex((a, j) => !usedItems.has(j) && want.keywords.every((k) => contains(a.description, k)));
    if (i < 0) {
      items.notes.push(`missed action item [${want.keywords.join(", ")}]`);
      continue;
    }
    usedItems.add(i);
    items.found++;
    const got = draft.actionItems[i];
    // Owner null = written by the note taker ("me") or nobody named: anything is accepted.
    const checks: [string, boolean][] = [[`due ${got.dueDate}${got.dueText ? ` ("${got.dueText}")` : ""}, expected ${want.dueDate}`, got.dueDate === want.dueDate]];
    if (want.owner) checks.push([`owner "${got.owner}", expected ${want.owner}`, contains(got.owner, want.owner)]);
    for (const [label, ok] of checks) {
      items.fieldsChecked++;
      if (ok) items.fields++;
      else items.notes.push(`[${want.keywords.join(", ")}] ${label}`);
    }
  }
  draft.actionItems.forEach((a, j) => {
    if (!usedItems.has(j)) {
      items.extra++;
      items.notes.push(`extra action item "${a.description}"`);
    }
  });

  const deals = score();
  const usedDeals = new Set<number>();
  for (const want of e.opportunities) {
    deals.expected++;
    const i = draft.opportunities.findIndex((o, j) => !usedDeals.has(j) && want.keywords.every((k) => contains(o.title, k)));
    if (i < 0) {
      deals.notes.push(`missed opportunity [${want.keywords.join(", ")}]`);
      continue;
    }
    usedDeals.add(i);
    deals.found++;
    deals.fieldsChecked++;
    const got = draft.opportunities[i];
    const accepted = Array.isArray(want.valueRm) ? want.valueRm : [want.valueRm];
    if (accepted.includes(got.valueRm)) deals.fields++;
    else deals.notes.push(`"${got.title}": value ${got.valueRm}, expected ${accepted.join(" or ")}`);
  }
  draft.opportunities.forEach((o, j) => {
    if (!usedDeals.has(j)) {
      deals.extra++;
      deals.notes.push(`extra opportunity "${o.title}"`);
    }
  });

  const all = [...draft.contacts, ...draft.actionItems, ...draft.opportunities];
  const flags = all.flatMap((x) => x.flags);
  return { people, staff, items, deals, unquoted: all.filter((x) => !x.evidenceFound).length, flags, total: all.length };
}

async function main() {
  const { values } = parseArgs({ options: { only: { type: "string" } } });
  const only = values.only?.split(",").map((s) => s.trim());
  const samples = samplesSchema.parse(JSON.parse(readFileSync("eval/notes.json", "utf8"))).filter((s) => !only || only.includes(s.id));
  const names = new Map((await sql<{ id: number; name: string }[]>`select id, name from contacts`).map((c) => [c.id, c.name]));

  const rows: string[] = [];
  const details: string[] = [];
  const totals = { people: score(), staff: score(), items: score(), deals: score() };
  for (const [n, sample] of samples.entries()) {
    if (n > 0) await new Promise((r) => setTimeout(r, CALL_SPACING_MS));
    process.stdout.write(`${sample.id} ${sample.title}… `);
    const result = await extract({ notes: sample.notes, meetingAt: sample.meetingAt }, { save: false });
    if (!result.ok) {
      console.log(`ERROR: ${result.message}`);
      rows.push(`| ${sample.id} | error: ${result.message} | | | | | |`);
      continue;
    }
    const g = grade(sample, result.draft, names);
    for (const k of ["people", "staff", "items", "deals"] as const) {
      for (const f of ["found", "expected", "extra", "fields", "fieldsChecked"] as const) totals[k][f] += g[k][f];
    }
    const cell = (s: Score) => `${s.found}/${s.expected}${s.extra ? ` +${s.extra}` : ""}${s.fieldsChecked ? ` (fields ${s.fields}/${s.fieldsChecked})` : ""}`;
    rows.push(
      `| ${sample.id} | ${cell(g.people)} | ${g.staff.found}/${g.staff.expected} | ${cell(g.items)} | ${cell(g.deals)} | ${g.unquoted}/${g.total} | ${result.draft.model}, ${(result.draft.ms / 1000).toFixed(1)} s |`,
    );
    const problems = [...g.people.notes, ...g.staff.notes, ...g.items.notes, ...g.deals.notes, ...g.flags.map((f) => `flag: ${f}`)];
    details.push(`**${sample.id} — ${sample.title}**\n\n${problems.length ? problems.map((p) => `- ${p}`).join("\n") : "- everything as expected"}`);
    console.log(problems.length ? `${problems.length} differences` : "all as expected");
  }

  const t = totals;
  const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "n/a");
  const report = `# Meeting Notes extraction check

Generated by \`npm run eval:notes\` on ${new Date().toISOString().slice(0, 10)}. Model ${notesModel()}, fallback ${chatModel()}.
Samples: [\`eval/notes.json\`](../notes.json). Each cell: found/expected, +extra items the model added, and (fields correct/checked)
for company, role, email and contact match (people), due date and owner (action items), RM value (opportunities).
"Unquoted" = items whose evidence quote wasn't found in the notes (the grounding check flags these in the review).

| Sample | People | taxPOD staff | Action items | Opportunities | Unquoted | Model |
|---|---|---|---|---|---|---|
${rows.join("\n")}

**Totals:** people ${t.people.found}/${t.people.expected} (${pct(t.people.found, t.people.expected)}), fields ${t.people.fields}/${t.people.fieldsChecked};
staff ${t.staff.found}/${t.staff.expected}; action items ${t.items.found}/${t.items.expected}, fields ${t.items.fields}/${t.items.fieldsChecked};
opportunities ${t.deals.found}/${t.deals.expected}, values ${t.deals.fields}/${t.deals.fieldsChecked};
extra items: ${t.people.extra + t.items.extra + t.deals.extra}.

## Differences

${details.join("\n\n")}
`;
  console.log(`\n${report}`);
  if (!only) {
    mkdirSync("eval/results", { recursive: true });
    writeFileSync("eval/results/notes.md", report);
    console.log("Wrote eval/results/notes.md");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
