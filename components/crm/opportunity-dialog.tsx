"use client";

import { PencilIcon, PlusIcon } from "lucide-react";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { saveOpportunity } from "@/app/opportunities/actions";
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
import { STAGE_LABELS, STAGES, type Opportunity } from "@/lib/crm/types";

export type ContactOption = { id: number; name: string; company: string | null };

/**
 * "New opportunity" or "Edit" button + form dialog. Pass `contacts` for a contact picker,
 * or `contact` to fix the contact (when opened from a contact's page).
 */
export function OpportunityDialog({
  opportunity,
  contacts,
  contact,
}: {
  opportunity?: Opportunity;
  contacts?: ContactOption[];
  contact?: { id: number; name: string };
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={opportunity || contact ? "outline" : "default"} size={contact ? "sm" : "default"} />}>
        {opportunity ? <PencilIcon data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}
        {opportunity ? "Edit" : "New opportunity"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{opportunity ? "Edit opportunity" : "New opportunity"}</DialogTitle>
        </DialogHeader>
        <OpportunityForm
          opportunity={opportunity}
          contacts={contacts}
          contact={contact}
          onSaved={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function OpportunityForm({
  opportunity,
  contacts,
  contact,
  onSaved,
}: {
  opportunity?: Opportunity;
  contacts?: ContactOption[];
  contact?: { id: number; name: string };
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await saveOpportunity(opportunity?.id ?? null, prev, formData);
    if (result.ok) {
      toast.success(opportunity ? "Opportunity updated" : "Opportunity created");
      onSaved();
    }
    return result;
  }, {});

  const errors = state.errors ?? {};
  const value = (name: "contact_id" | "title" | "value_rm" | "stage", fallback: string) =>
    state.values?.[name] ?? fallback;

  return (
    <form action={formAction} className="grid gap-4">
      <Field name="title" label="Title" errors={errors.title}>
        <Input {...fieldProps("title", errors.title)} defaultValue={value("title", opportunity?.title ?? "")} required autoFocus />
      </Field>
      {contact ? (
        <div className="grid gap-1.5 text-sm">
          <span className="font-medium">Contact</span>
          <span>{contact.name}</span>
          <input type="hidden" name="contact_id" value={contact.id} />
        </div>
      ) : (
        <Field name="contact_id" label="Contact" errors={errors.contact_id}>
          <NativeSelect
            {...fieldProps("contact_id", errors.contact_id)}
            defaultValue={value("contact_id", String(opportunity?.contact_id ?? ""))}
            className="w-full"
            required
          >
            <NativeSelectOption value="" disabled>
              Choose a contact…
            </NativeSelectOption>
            {contacts?.map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>
                {c.company ? `${c.name} (${c.company})` : c.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="value_rm" label="Value (RM)" errors={errors.value_rm}>
          <Input
            {...fieldProps("value_rm", errors.value_rm)}
            inputMode="decimal"
            placeholder="15000"
            defaultValue={value("value_rm", opportunity ? String(opportunity.value_rm) : "")}
            required
          />
        </Field>
        <Field name="stage" label="Stage" errors={errors.stage}>
          <NativeSelect {...fieldProps("stage", errors.stage)} defaultValue={value("stage", opportunity?.stage ?? "new")} className="w-full">
            {STAGES.map((s) => (
              <NativeSelectOption key={s} value={s}>
                {STAGE_LABELS[s]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </div>
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
