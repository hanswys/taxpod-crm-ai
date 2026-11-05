// Reviewed draft → CRM writes, all in one transaction (D-a, D-d, D-e). Every row passes the
// same zod schemas as the normal CRM forms first; any failure writes nothing.
import { z } from "zod";
import { createActivity } from "@/lib/crm/activities";
import { createContact, getContact, updateContact } from "@/lib/crm/contacts";
import { createOpportunity, getOpportunity, setOpportunityStage } from "@/lib/crm/opportunities";
import { activityInput, contactInput, opportunityInput, type ActivityInput, type ContactInput, type OpportunityInput } from "@/lib/crm/schemas";
import { pgErrorCode, sql } from "@/lib/db";
import { parseDateTimeLocal } from "@/lib/format";
import { confirmInput, type ConfirmInput, type ConfirmResult } from "@/lib/notes/schema";

/** Thrown inside the transaction to roll it back with a message for the form. */
class ConfirmError extends Error {
  constructor(
    message: string,
    readonly errors?: Record<string, string>,
  ) {
    super(message);
  }
}

type Plan = {
  meetingAt: Date;
  contacts: { ref: string; name: string; input: ContactInput; targetId: number | null; index: number }[];
  opportunities: (
    | { kind: "create"; contactRef: string; input: Omit<OpportunityInput, "contact_id"> }
    | { kind: "link"; contactRef: string; id: number; stage: OpportunityInput["stage"] | null }
  )[];
  activities: { contactRef: string; input: Omit<ActivityInput, "contact_id" | "opportunity_id"> }[];
};

export async function confirm(payload: unknown): Promise<ConfirmResult> {
  const parsed = confirmInput.safeParse(payload);
  if (!parsed.success) return { ok: false, message: "The review form sent something unexpected. Reload the page and try again." };
  const input = parsed.data;

  const planned = plan(input);
  if (!planned.ok) return planned.result;
  const p = planned.plan;

  try {
    return await sql.begin(async (tx) => {
      // Claim the extraction first, so a double click can't write everything twice.
      const claimed = await tx`
        update meeting_notes set confirmed = ${tx.json(input)}, confirmed_at = now()
        where id = ${input.noteId} and confirmed_at is null
        returning id
      `;
      if (claimed.count === 0) throw new ConfirmError("These notes were already confirmed (or no longer exist). Start over to extract them again.");

      const contactIds = new Map<string, number>();
      const written: Extract<ConfirmResult, { ok: true }> = { ok: true, contacts: [], opportunities: [], activities: 0 };

      for (const c of p.contacts) {
        if (c.targetId === null) {
          if (c.input.email) {
            const [existing] = await tx<{ name: string }[]>`select name from contacts where lower(email) = ${c.input.email}`;
            if (existing) {
              throw new ConfirmError("Fix the highlighted rows.", {
                [`contacts.${c.index}.email`]: `${existing.name} already has this email. Choose "Update existing" instead.`,
              });
            }
          }
          const created = await createContact(c.input, tx);
          contactIds.set(c.ref, created.id);
          written.contacts.push({ id: created.id, name: created.name, action: "created" });
        } else {
          const existing = await getContact(c.targetId, tx);
          if (!existing) throw new ConfirmError(`The contact chosen for ${c.name} no longer exists.`);
          // The extractor never changes a contact's status (D-d).
          const updated = await updateContact(c.targetId, { ...c.input, status: existing.status }, tx);
          contactIds.set(c.ref, updated!.id);
          written.contacts.push({ id: updated!.id, name: updated!.name, action: "updated" });
        }
      }

      // The first opportunity per contact is attached to that contact's activities.
      const opportunityFor = new Map<string, number>();
      for (const o of p.opportunities) {
        const contactId = contactIds.get(o.contactRef)!;
        let id: number;
        if (o.kind === "create") {
          ({ id } = await createOpportunity({ ...o.input, contact_id: contactId }, tx));
          written.opportunities.push({ id, title: o.input.title, action: "created" });
        } else {
          const existing = await getOpportunity(o.id, tx);
          if (!existing) throw new ConfirmError("An opportunity chosen to link to no longer exists.");
          id = existing.id;
          if (o.stage) await setOpportunityStage(id, o.stage, tx);
          written.opportunities.push({ id, title: existing.title, action: "linked" });
        }
        if (!opportunityFor.has(o.contactRef)) opportunityFor.set(o.contactRef, id);
      }

      for (const a of p.activities) {
        await createActivity(
          { ...a.input, contact_id: contactIds.get(a.contactRef)!, opportunity_id: opportunityFor.get(a.contactRef) ?? null },
          tx,
        );
        written.activities++;
      }

      const ids = { contacts: written.contacts, opportunities: written.opportunities, activities: written.activities };
      await tx`update meeting_notes set written = ${tx.json(ids)} where id = ${input.noteId}`;
      return written;
    });
  } catch (error) {
    if (error instanceof ConfirmError) return { ok: false, message: error.message, errors: error.errors };
    if (pgErrorCode(error) === "23505") return { ok: false, message: "A contact with one of these emails already exists. Choose \"Update existing\" for that person." };
    if (pgErrorCode(error) === "23503") return { ok: false, message: "A contact or opportunity was deleted meanwhile. Nothing was saved; start over." };
    console.error("[notes] confirm failed:", error);
    return { ok: false, message: "Saving failed. Nothing was written. Details are in the server log." };
  }
}

/** Validate every row with the CRM schemas before touching the DB. Error keys match the review form's fields. */
function plan(input: ConfirmInput): { ok: true; plan: Plan } | { ok: false; result: ConfirmResult } {
  const errors: Record<string, string> = {};
  const meetingAt = parseDateTimeLocal(input.meetingAt);
  if (Number.isNaN(meetingAt.getTime())) errors.meetingAt = "Enter the meeting date and time";

  const contacts: Plan["contacts"] = [];
  input.contacts.forEach((c, i) => {
    if (c.action === "skip") return;
    if (c.action === "update" && c.targetId === null) {
      errors[`contacts.${i}.targetId`] = "Choose the contact to update";
      return;
    }
    const result = contactInput.safeParse({ ...c.fields, status: c.status });
    if (!result.success) return addErrors(errors, `contacts.${i}`, result.error);
    contacts.push({ ref: c.ref, name: result.data.name, input: result.data, targetId: c.action === "update" ? c.targetId : null, index: i });
  });
  const included = new Set(contacts.map((c) => c.ref));
  const needsContact = (key: string, ref: string) => {
    if (included.has(ref)) return true;
    errors[key] = "Choose a contact that's being saved";
    return false;
  };

  const opportunities: Plan["opportunities"] = [];
  input.opportunities.forEach((o, i) => {
    if (o.action === "skip" || !needsContact(`opportunities.${i}.contactRef`, o.contactRef)) return;
    if (o.action === "link") {
      if (o.linkId === null) errors[`opportunities.${i}.linkId`] = "Choose the opportunity to link";
      else opportunities.push({ kind: "link", contactRef: o.contactRef, id: o.linkId, stage: o.linkStage });
      return;
    }
    // Blank value = not discussed yet: RM 0, the same default as the database.
    const result = opportunityInput.safeParse({ contact_id: 1, title: o.title, value_rm: o.valueRm.trim() || "0", stage: o.stage });
    if (!result.success) return addErrors(errors, `opportunities.${i}`, result.error, { value_rm: "valueRm" });
    const { title, value_rm, stage } = result.data;
    opportunities.push({ kind: "create", contactRef: o.contactRef, input: { title, value_rm, stage } });
  });

  const activities: Plan["activities"] = [];
  const addActivity = (key: string, contactRef: string, type: ActivityInput["type"], description: string) => {
    const result = activityInput.safeParse({ contact_id: 1, opportunity_id: null, type, occurred_at: meetingAt, description });
    if (!result.success) return addErrors(errors, key, result.error, key === "summary" ? { description: "text" } : {});
    activities.push({ contactRef, input: { type, occurred_at: result.data.occurred_at, description: result.data.description } });
  };
  input.actionItems.forEach((a, i) => {
    if (!a.include || !needsContact(`actionItems.${i}.contactRef`, a.contactRef)) return;
    if (!a.description.trim()) {
      errors[`actionItems.${i}.description`] = "Description is required";
      return;
    }
    if (a.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(a.dueDate)) errors[`actionItems.${i}.dueDate`] = "Enter a valid date";
    addActivity(`actionItems.${i}`, a.contactRef, "note", actionItemText(a));
  });
  // Logged last: activities share the meeting time, and timelines show the newest id first,
  // so the summary sits above its action items.
  if (input.summary.include) {
    if (contacts.length === 0) errors["summary.text"] = "Save at least one contact to log the meeting against";
    for (const c of contacts) addActivity("summary", c.ref, input.summary.type, input.summary.text);
  }

  if (Object.keys(errors).length > 0) return { ok: false, result: { ok: false, message: "Fix the highlighted rows.", errors } };
  if (contacts.length === 0 && activities.length === 0) {
    return { ok: false, result: { ok: false, message: "Nothing to save: every row is skipped." } };
  }
  return { ok: true, plan: { meetingAt, contacts, opportunities, activities } };
}

/** "Action item: Send the SST proposal. Owner: Aina. Due: Fri, 14 Nov 2026 ("next Friday")." */
export function actionItemText(a: Pick<ConfirmInput["actionItems"][number], "description" | "owner" | "dueDate" | "dueText">): string {
  const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);
  let text = `Action item: ${sentence(a.description.trim())}`;
  if (a.owner.trim()) text += ` Owner: ${a.owner.trim()}.`;
  if (a.dueDate) {
    const due = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(
      new Date(`${a.dueDate}T00:00:00Z`),
    );
    text += ` Due: ${due}${a.dueText.trim() ? ` ("${a.dueText.trim()}")` : ""}.`;
  } else if (a.dueText.trim()) {
    text += ` Due: ${a.dueText.trim()}.`;
  }
  return text;
}

/** zod issues → "contacts.0.email": "Enter a valid email address". `rename` maps schema fields to form fields. */
function addErrors(errors: Record<string, string>, prefix: string, error: z.ZodError, rename: Record<string, string> = {}) {
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    const key = field ? `${prefix}.${rename[field] ?? field}` : prefix;
    errors[key] ??= issue.message;
  }
}
