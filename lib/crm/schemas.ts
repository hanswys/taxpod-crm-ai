import { z } from "zod";
import { parseDateTimeLocal } from "@/lib/format";
import { ACTIVITY_TYPES, CONTACT_STATUSES, STAGES } from "@/lib/crm/types";

// Input validation for CRM writes. Used by the server actions and by the Meeting Notes
// confirm (lib/notes/confirm.ts), so form input and reviewed LLM output pass the same rules.

/** Form fields arrive as strings; treat blank as "not given". */
const blankToNull = (value: unknown) =>
  value === undefined || (typeof value === "string" && value.trim() === "") ? null : value;

const optionalText = (max: number) =>
  z.preprocess(blankToNull, z.string().trim().max(max, `At most ${max} characters`).nullable());

const id = z.coerce.number().int().positive();
const optionalId = z.preprocess(blankToNull, id.nullable());

export const contactInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(200, "At most 200 characters"),
  email: z.preprocess(
    blankToNull,
    z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")).nullable(),
  ),
  phone: optionalText(50),
  company: optionalText(200),
  role: optionalText(200),
  status: z.enum(CONTACT_STATUSES).default("lead"),
});
export type ContactInput = z.infer<typeof contactInput>;

// numeric(12,2): up to 9,999,999,999.99
const MAX_VALUE_RM = 9_999_999_999.99;

export const opportunityInput = z.object({
  contact_id: z.coerce.number({ error: "Choose a contact" }).int().positive("Choose a contact"),
  title: z.string().trim().min(1, "Title is required").max(200, "At most 200 characters"),
  // Accepts 15000, "15,000" or "15000.50". Checked as a string so 0.1 + float rounding can't sneak past.
  value_rm: z.preprocess(
    (v) => (typeof v === "number" ? String(v) : typeof v === "string" ? v.replace(/,/g, "").trim() : v),
    z
      .string({ error: "Enter a value" })
      .regex(/^\d+(\.\d{1,2})?$/, "Enter an amount in RM, e.g. 15000 or 15000.50")
      .transform(Number)
      .refine((v) => v <= MAX_VALUE_RM, "Value is too large"),
  ),
  stage: z.enum(STAGES).default("new"),
});
export type OpportunityInput = z.infer<typeof opportunityInput>;

export const stageInput = z.enum(STAGES);

export const activityInput = z
  .object({
    contact_id: optionalId,
    opportunity_id: optionalId,
    type: z.enum(ACTIVITY_TYPES, { error: "Choose a type" }),
    occurred_at: z.preprocess(
      (v) => (typeof v === "string" ? parseDateTimeLocal(v) : v),
      z.date({ error: "Enter a valid date and time" }),
    ),
    description: z.string().trim().min(1, "Description is required").max(2000, "At most 2000 characters"),
  })
  .refine((a) => a.contact_id !== null || a.opportunity_id !== null, {
    message: "Log the activity against a contact or an opportunity",
    path: ["contact_id"],
  });
export type ActivityInput = z.infer<typeof activityInput>;

/** Shape returned by every form's server action (read by useActionState). */
export type FormState = {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string[] | undefined>;
  /** Submitted values, so the form keeps them after a failed submit (React resets forms after an action). */
  values?: Record<string, string>;
};

export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData) if (typeof value === "string") values[key] = value;
  return values;
}

/** Validate FormData against a schema; on failure, return a FormState with field errors. */
export function parseForm<T extends z.ZodType>(
  schema: T,
  formData: FormData,
): { ok: true; data: z.output<T> } | { ok: false; state: FormState } {
  const values = formValues(formData);
  const result = schema.safeParse(values);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, state: { errors: z.flattenError(result.error).fieldErrors, values } };
}

/** Route param or bound action argument → positive integer id, or null if it isn't one. */
export function parseId(value: unknown): number | null {
  const result = id.safeParse(value);
  return result.success ? result.data : null;
}
