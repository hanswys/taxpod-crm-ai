// Meeting notes → draft: Gemini (JSON schema) → server checks → contact matching → log.
// Nothing is written to the CRM here; that only happens in confirm.ts after the user reviews.
// No Next.js imports, so `npm run eval:notes` uses exactly what the UI uses.
import { z } from "zod";
import { pgErrorCode, sql } from "@/lib/db";
import { parseDateTimeLocal, toDateTimeLocal } from "@/lib/format";
import { chatModel, classifyLlmError, generateJson, notesModel } from "@/lib/llm";
import { matchContacts } from "@/lib/notes/match";
import { buildExtractPrompt, EXTRACT_INSTRUCTION } from "@/lib/notes/prompt";
import {
  extractionSchema,
  NOTES_MAX,
  NOTES_MIN,
  type Check,
  type Draft,
  type DraftContact,
  type Extraction,
} from "@/lib/notes/schema";

export const extractInput = z.object({
  notes: z
    .string()
    .trim()
    .min(NOTES_MIN, `Paste the meeting notes (at least ${NOTES_MIN} characters)`)
    .max(NOTES_MAX, `Notes can be at most ${NOTES_MAX.toLocaleString()} characters`),
  meetingAt: z
    .string()
    .refine((v) => !Number.isNaN(parseDateTimeLocal(v).getTime()), "Enter the meeting date and time"),
});

export type ExtractResult = { ok: true; draft: Draft } | { ok: false; message: string; retryable: boolean };

export async function extract(
  input: z.input<typeof extractInput>,
  { save = true }: { save?: boolean } = {},
): Promise<ExtractResult> {
  const parsed = extractInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message, retryable: false };
  const { notes } = parsed.data;
  const meetingAt = parseDateTimeLocal(parsed.data.meetingAt);
  const started = performance.now();

  let extraction: Extraction;
  let model: string;
  try {
    ({ data: extraction, model } = await generateJson(buildExtractPrompt(notes, meetingAt), EXTRACT_INSTRUCTION, extractionSchema, {
      models: [...new Set([notesModel(), chatModel()])],
    }));
  } catch (error) {
    console.error("[notes]", error);
    const result = describeError(error);
    if (save) await logExtraction(notes, meetingAt, null, null, Math.round(performance.now() - started), error).catch(() => {});
    return result;
  }
  const ms = Math.round(performance.now() - started);

  try {
    const draft = await toDraft(notes, meetingAt, extraction, model, ms);
    if (save) draft.noteId = await logExtraction(notes, meetingAt, extraction, model, ms);
    return { ok: true, draft };
  } catch (error) {
    console.error("[notes]", error);
    return describeError(error);
  }
}

/** Apply the grounding checks (D-f) and match people to existing contacts (D-c). */
export async function toDraft(notes: string, meetingAt: Date, x: Extraction, model: string, ms: number): Promise<Draft> {
  const haystack = normalise(notes);
  const found = (quote: string) => isQuoted(quote, haystack);

  const people = dedupeByRef(x.contacts);
  const external = people.filter((c) => !c.is_internal);
  const externalRefs = new Set(external.map((c) => c.ref));
  const ref = (r: string | null) => (r && externalRefs.has(r) ? r : null);

  const contacts: Omit<DraftContact, "match">[] = external.map((c) => {
    const flags: string[] = [];
    const email = c.email ? checkEmail(c.email, notes, flags) : null;
    const phone = c.phone ? checkPhone(c.phone, notes, flags) : null;
    return {
      ref: c.ref,
      fields: { name: c.name.trim(), email, phone, company: blank(c.company), role: blank(c.role) },
      evidence: c.evidence,
      ...check(found(c.evidence) || found(c.name), flags),
    };
  });
  const matches = await matchContacts(contacts.map((c) => c.fields));

  return {
    noteId: null,
    meetingAt: toDateTimeLocal(meetingAt),
    summary: x.summary.trim(),
    interaction: x.interaction,
    contacts: contacts.map((c, i) => ({ ...c, match: matches[i] })),
    internal: people.filter((c) => c.is_internal).map((c) => ({ name: c.name, role: blank(c.role) })),
    actionItems: x.action_items.map((a) => {
      const flags: string[] = [];
      const dueDate = a.due_date && isIsoDate(a.due_date) ? a.due_date : null;
      if (a.due_date && !dueDate) flags.push(`The due date "${a.due_date}" isn't a valid date, so it was removed.`);
      return {
        description: a.description.trim(),
        owner: blank(a.owner),
        contactRef: ref(a.contact_ref),
        dueDate,
        dueText: blank(a.due_text),
        evidence: a.evidence,
        ...check(found(a.evidence), flags),
      };
    }),
    opportunities: x.opportunities.map((o) => {
      const flags: string[] = [];
      // The value must come from a figure in the notes, not the model's sense of a typical deal.
      if (o.value_rm !== null && !/\d/.test(o.evidence)) {
        flags.push("The quoted text has no figure. Check the RM amount against the notes.");
      }
      return {
        title: o.title.trim(),
        contactRef: ref(o.contact_ref),
        valueRm: o.value_rm !== null && o.value_rm >= 0 ? o.value_rm : null,
        stage: o.stage_hint,
        evidence: o.evidence,
        ...check(found(o.evidence), flags),
      };
    }),
    model,
    ms,
  };
}

// --- Grounding checks ------------------------------------------------------------------

/** Lowercase, unify quotes and dashes, collapse punctuation and spacing, so light reformatting still matches. */
export function normalise(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}@.+%]+/gu, " ")
    .replace(/\.(?=\s|$)/g, "") // sentence-final dots, but keep "2.5" and emails
    .replace(/\s+/g, " ")
    .trim();
}

/** The quote is in the notes. "…" or "..." in a quote may skip text, so each part is checked on its own. */
function isQuoted(quote: string, haystack: string): boolean {
  const parts = quote
    .split(/\.\.\.|…/)
    .map(normalise)
    .filter(Boolean);
  return parts.length > 0 && parts.every((p) => haystack.includes(p));
}

function check(evidenceFound: boolean, flags: string[]): Check {
  if (!evidenceFound) flags.unshift("The quoted text isn't in the notes. Check this item before confirming.");
  return { evidenceFound, flags };
}

/** Keep an email only if it's valid and appears in the notes exactly. */
function checkEmail(email: string, notes: string, flags: string[]): string | null {
  const value = email.trim().toLowerCase();
  if (!z.email().safeParse(value).success) {
    flags.push(`"${email}" isn't a valid email address, so it was removed.`);
    return null;
  }
  if (!notes.toLowerCase().includes(value)) {
    flags.push(`The email ${value} isn't in the notes, so it was removed.`);
    return null;
  }
  return value;
}

/** Keep a phone number only if its digits appear in the notes (spacing and dashes may differ). */
function checkPhone(phone: string, notes: string, flags: string[]): string | null {
  const digits = phone.replace(/\D/g, "");
  const noteDigits = notes.replace(/(?<=\d)[\s\-().]+(?=\d)/g, "").replace(/[^\d]+/g, " ");
  if (digits.length < 7 || !noteDigits.split(" ").some((run) => run.includes(digits))) {
    flags.push(`The phone number ${phone} isn't in the notes, so it was removed.`);
    return null;
  }
  return phone.trim();
}

const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());
const blank = (s: string | null) => (s && s.trim() ? s.trim() : null);

function dedupeByRef<T extends { ref: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((i) => !seen.has(i.ref) && seen.add(i.ref));
}

// --- Logging and errors -----------------------------------------------------------------

/** One meeting_notes row per extraction (D-h). Returns its id, which the confirm refers to. */
async function logExtraction(
  notes: string,
  meetingAt: Date,
  extraction: Extraction | null,
  model: string | null,
  latencyMs: number,
  error?: unknown,
): Promise<number> {
  const errorText = error === undefined ? null : String(error instanceof Error ? error.message : error).slice(0, 1000);
  const [row] = await sql<{ id: number }[]>`
    insert into meeting_notes (notes, meeting_at, extraction, model, latency_ms, error)
    values (${notes}, ${meetingAt}, ${extraction ? sql.json(extraction) : null}, ${model}, ${latencyMs}, ${errorText})
    returning id
  `;
  return row.id;
}

function describeError(error: unknown): Extract<ExtractResult, { ok: false }> {
  const code = (error as { code?: string } | null)?.code;
  if (error instanceof AggregateError || code === "ECONNREFUSED" || code === "ENOTFOUND") {
    return { ok: false, message: "The database is unavailable. Is Docker running? (`npm run db:up`)", retryable: false };
  }
  if (pgErrorCode(error) === "42P01" || pgErrorCode(error) === "42703") {
    return { ok: false, message: "The database is missing the Meeting Notes table. See README → Meeting Notes.", retryable: false };
  }
  if (pgErrorCode(error)) {
    return { ok: false, message: "A database error occurred. Details are in the server log.", retryable: true };
  }
  const llm = classifyLlmError(error);
  switch (llm.kind) {
    case "auth":
      return { ok: false, message: "The Gemini API key is missing or invalid. Set GEMINI_API_KEY in .env (see README).", retryable: false };
    case "busy":
      if (llm.quota === "day") {
        const hours = Math.ceil((llm.retryAfterSeconds ?? 0) / 3600);
        return { ok: false, message: `Gemini's free-tier daily limit is used up${hours ? ` (resets in about ${hours} h)` : ""}. Use another API key, or try again later.`, retryable: false };
      }
      return llm.retryAfterSeconds !== undefined
        ? { ok: false, message: `Gemini's free-tier limit was reached. Try again in ${llm.retryAfterSeconds} s.`, retryable: true }
        : { ok: false, message: "Gemini is busy right now. Try again in a minute.", retryable: true };
    case "model":
      return { ok: false, message: "The Gemini model isn't available. Check GEMINI_CHAT_MODEL in .env (`npm run check:gemini` lists models).", retryable: false };
    case "bad_output":
      return { ok: false, message: "Gemini returned the extraction in the wrong format. Try again.", retryable: true };
    default:
      return { ok: false, message: "Something went wrong. Details are in the server log.", retryable: true };
  }
}
