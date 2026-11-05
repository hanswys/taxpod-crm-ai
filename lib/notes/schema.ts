// Meeting Notes Extractor (M5): the shape Gemini must return, the draft the review form
// shows, and the payload the user confirms.
import { z } from "zod";
import { CONTACT_STATUSES, STAGES, type Contact } from "@/lib/crm/types";

export const NOTES_MIN = 20;
export const NOTES_MAX = 10_000;

const evidence = z
  .string()
  .describe("A short quote copied word for word from the notes that shows where this item comes from");

// Gemini enforces this shape while generating (lib/llm.ts generateJson); zod checks it again.
export const extractionSchema = z.object({
  summary: z.string().describe("1-3 sentences: what the meeting was about and what was agreed"),
  interaction: z.enum(["meeting", "call"]).describe("call if the notes describe a phone or video call, otherwise meeting"),
  contacts: z.array(
    z.object({
      ref: z.string().describe('Short id for this person, "c1", "c2", …, used by action_items and opportunities'),
      name: z.string(),
      company: z.string().nullable(),
      role: z.string().nullable().describe("Job title, if the notes say"),
      email: z.string().nullable().describe("Only if written in the notes"),
      phone: z.string().nullable().describe("Only if written in the notes"),
      is_internal: z.boolean().describe("true for YYC taxPOD staff (the note writer's colleagues)"),
      evidence,
    }),
  ),
  action_items: z.array(
    z.object({
      description: z.string().describe("What has to be done, as a short imperative sentence"),
      owner: z.string().nullable().describe("Who will do it, as named in the notes"),
      contact_ref: z.string().nullable().describe("ref of the external contact this item concerns"),
      due_date: z.string().nullable().describe("YYYY-MM-DD, resolved against the meeting date; null if no date is given"),
      due_text: z.string().nullable().describe('The due date as worded in the notes, e.g. "next Friday"'),
      evidence,
    }),
  ),
  opportunities: z.array(
    z.object({
      title: z.string().describe('What could be sold, e.g. "SST training for 4 hotels"'),
      contact_ref: z.string().nullable().describe("ref of the external contact the deal is with"),
      value_rm: z.number().nullable().describe("Value in RM only if a figure is stated; null otherwise"),
      stage_hint: z.enum(STAGES).nullable().describe("Pipeline stage suggested by the notes, if any"),
      evidence,
    }),
  ),
});
export type Extraction = z.infer<typeof extractionSchema>;

// ---------------------------------------------------------------------------------------
// Draft: the extraction after the server's checks, plus contact matches. Shown for review.

export type ContactFields = Pick<Contact, "name" | "email" | "phone" | "company" | "role">;
export type Check = { evidenceFound: boolean; flags: string[] };

export type DraftContact = Check & {
  ref: string;
  fields: ContactFields;
  evidence: string;
  /** email = same email as an existing contact; name = same name (and company, if both have one). */
  match: { kind: "email" | "name"; contactId: number } | null;
};
export type DraftActionItem = Check & {
  description: string;
  owner: string | null;
  contactRef: string | null;
  dueDate: string | null;
  dueText: string | null;
  evidence: string;
};
export type DraftOpportunity = Check & {
  title: string;
  contactRef: string | null;
  valueRm: number | null;
  stage: (typeof STAGES)[number] | null;
  evidence: string;
};
export type Draft = {
  noteId: number | null; // null when the meeting_notes row couldn't be written (eval with save: false)
  meetingAt: string; // datetime-local, Malaysia time
  summary: string;
  interaction: "meeting" | "call";
  contacts: DraftContact[]; // external people only
  internal: { name: string; role: string | null }[]; // taxPOD staff: owners, never CRM contacts
  actionItems: DraftActionItem[];
  opportunities: DraftOpportunity[];
  model: string;
  ms: number;
};

// ---------------------------------------------------------------------------------------
// Confirm: what the review form sends back. Rows refer to contact rows by `ref`.
// Field-level rules (email format, lengths, RM amounts) are checked again with the CRM
// schemas in confirm.ts, exactly as the normal forms do.

const ref = z.string().min(1);
const id = z.number().int().positive();

export const confirmInput = z.object({
  noteId: id,
  meetingAt: z.string(),
  summary: z.object({ include: z.boolean(), type: z.enum(["meeting", "call"]), text: z.string() }),
  contacts: z.array(
    z.object({
      ref,
      action: z.enum(["create", "update", "skip"]),
      targetId: id.nullable(), // update: which existing contact
      fields: z.object({
        name: z.string(),
        email: z.string(),
        phone: z.string(),
        company: z.string(),
        role: z.string(),
      }),
      status: z.enum(CONTACT_STATUSES), // create only; an update keeps the contact's status
    }),
  ),
  opportunities: z.array(
    z.object({
      action: z.enum(["create", "link", "skip"]),
      contactRef: z.string(),
      title: z.string(),
      valueRm: z.string(),
      stage: z.enum(STAGES),
      linkId: id.nullable(), // link: which existing opportunity
      linkStage: z.enum(STAGES).nullable(), // link: move it to this stage (null = leave as is)
    }),
  ),
  actionItems: z.array(
    z.object({
      include: z.boolean(),
      contactRef: z.string(),
      description: z.string(),
      owner: z.string(),
      dueDate: z.string(), // YYYY-MM-DD or ""
      dueText: z.string(),
    }),
  ),
});
export type ConfirmInput = z.infer<typeof confirmInput>;

export type ConfirmResult =
  | {
      ok: true;
      contacts: { id: number; name: string; action: "created" | "updated" }[];
      opportunities: { id: number; title: string; action: "created" | "linked" }[];
      activities: number;
    }
  | { ok: false; message: string; errors?: Record<string, string> };
