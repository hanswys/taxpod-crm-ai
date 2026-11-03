"use client";

import { PencilIcon, PlusIcon } from "lucide-react";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { saveContact } from "@/app/leads/actions";
import { Field, fieldProps } from "@/components/crm/field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { FormState } from "@/lib/crm/schemas";
import { CONTACT_STATUS_LABELS, CONTACT_STATUSES, type Contact } from "@/lib/crm/types";

/** "New lead" (no contact) or "Edit" (with contact) button that opens the form in a dialog. */
export function ContactDialog({ contact }: { contact?: Contact }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={contact ? "outline" : "default"} />}>
        {contact ? <PencilIcon data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}
        {contact ? "Edit" : "New lead"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{contact ? "Edit contact" : "New lead"}</DialogTitle>
        </DialogHeader>
        {/* Mounted only while open, so each opening starts with a fresh form state. */}
        <ContactForm contact={contact} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ContactForm({ contact, onSaved }: { contact?: Contact; onSaved: () => void }) {
  const [state, formAction, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await saveContact(contact?.id ?? null, prev, formData);
    if (result.ok) {
      toast.success(contact ? "Contact updated" : "Lead created");
      onSaved();
    }
    return result;
  }, {});

  // After a failed submit, show what the user typed rather than the original values.
  const value = (name: keyof Contact) => state.values?.[name] ?? (contact?.[name] as string | null) ?? "";
  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="grid gap-4">
      <Field name="name" label="Name" errors={errors.name}>
        <Input {...fieldProps("name", errors.name)} defaultValue={value("name")} required autoFocus />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="email" label="Email" errors={errors.email}>
          <Input {...fieldProps("email", errors.email)} type="email" defaultValue={value("email")} />
        </Field>
        <Field name="phone" label="Phone" errors={errors.phone}>
          <Input {...fieldProps("phone", errors.phone)} type="tel" defaultValue={value("phone")} />
        </Field>
      </div>
      <Field name="company" label="Company" errors={errors.company}>
        <Input {...fieldProps("company", errors.company)} defaultValue={value("company")} />
      </Field>
      <Field name="status" label="Status" errors={errors.status}>
        <NativeSelect {...fieldProps("status", errors.status)} defaultValue={value("status") || "lead"} className="w-full">
          {CONTACT_STATUSES.map((s) => (
            <NativeSelectOption key={s} value={s}>
              {CONTACT_STATUS_LABELS[s]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      {state.message && <p className="text-sm text-destructive">{state.message}</p>}
      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}
