"use server";

import { refresh } from "next/cache";
import { createActivity, deleteActivity } from "@/lib/crm/activities";
import { activityInput, formValues, parseForm, parseId, type FormState } from "@/lib/crm/schemas";
import { pgErrorCode } from "@/lib/db";

/** The form sends contact_id or opportunity_id as a hidden field, depending on the page. */
export async function logActivity(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(activityInput, formData);
  if (!parsed.ok) return parsed.state;

  try {
    await createActivity(parsed.data);
  } catch (error) {
    if (pgErrorCode(error) === "23503") {
      return { message: "That contact or opportunity no longer exists.", values: formValues(formData) };
    }
    throw error;
  }

  refresh();
  return { ok: true };
}

export async function deleteActivityAction(id: number): Promise<void> {
  const activityId = parseId(id);
  if (activityId) await deleteActivity(activityId);
  refresh();
}
