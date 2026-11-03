"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { createContact, deleteContact, updateContact } from "@/lib/crm/contacts";
import { contactInput, formValues, parseForm, parseId, type FormState } from "@/lib/crm/schemas";
import { pgErrorCode } from "@/lib/db";

/** Create (id = null) or update a contact. Bound with the id by the form. */
export async function saveContact(id: number | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(contactInput, formData);
  if (!parsed.ok) return parsed.state;

  try {
    if (id === null) {
      await createContact(parsed.data);
    } else {
      const contactId = parseId(id);
      if (!contactId || !(await updateContact(contactId, parsed.data))) {
        return { message: "This contact no longer exists.", values: formValues(formData) };
      }
    }
  } catch (error) {
    if (pgErrorCode(error) === "23505") {
      return { errors: { email: ["A contact with this email already exists"] }, values: formValues(formData) };
    }
    throw error;
  }

  refresh();
  return { ok: true };
}

/** Cascades to the contact's opportunities and activities (confirmed in the UI first). */
export async function deleteContactAction(id: number): Promise<void> {
  const contactId = parseId(id);
  if (contactId) await deleteContact(contactId);
  redirect("/leads");
}
