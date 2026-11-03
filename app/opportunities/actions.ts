"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import {
  createOpportunity,
  deleteOpportunity,
  setOpportunityStage,
  updateOpportunity,
} from "@/lib/crm/opportunities";
import { formValues, opportunityInput, parseForm, parseId, stageInput, type FormState } from "@/lib/crm/schemas";
import { pgErrorCode } from "@/lib/db";

/** Create (id = null) or update an opportunity. Bound with the id by the form. */
export async function saveOpportunity(id: number | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(opportunityInput, formData);
  if (!parsed.ok) return parsed.state;

  try {
    if (id === null) {
      await createOpportunity(parsed.data);
    } else {
      const opportunityId = parseId(id);
      if (!opportunityId || !(await updateOpportunity(opportunityId, parsed.data))) {
        return { message: "This opportunity no longer exists.", values: formValues(formData) };
      }
    }
  } catch (error) {
    if (pgErrorCode(error) === "23503") {
      return { errors: { contact_id: ["That contact no longer exists"] }, values: formValues(formData) };
    }
    throw error;
  }

  refresh();
  return { ok: true };
}

/** Kanban drag-and-drop and the stage select on the detail page. */
export async function moveOpportunity(id: number, stage: string): Promise<{ ok: boolean; message?: string }> {
  const opportunityId = parseId(id);
  const parsedStage = stageInput.safeParse(stage);
  if (!opportunityId || !parsedStage.success) return { ok: false, message: "Invalid stage change." };

  await setOpportunityStage(opportunityId, parsedStage.data);
  refresh();
  return { ok: true };
}

export async function deleteOpportunityAction(id: number): Promise<void> {
  const opportunityId = parseId(id);
  if (opportunityId) await deleteOpportunity(opportunityId);
  redirect("/opportunities");
}
