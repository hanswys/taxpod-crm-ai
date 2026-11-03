"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import { logActivity } from "@/app/activities/actions";
import { Field, fieldProps } from "@/components/crm/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "@/lib/crm/schemas";
import { ACTIVITY_TYPE_LABELS, ACTIVITY_TYPES } from "@/lib/crm/types";

/**
 * Log a call/email/meeting/note. `target` decides what it's logged against.
 * `now` is "YYYY-MM-DDTHH:mm" in Malaysia time, computed on the server so it matches on hydration.
 */
export function ActivityForm({
  target,
  now,
}: {
  target: { contact_id: number } | { opportunity_id: number };
  now: string;
}) {
  const [state, formAction, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await logActivity(prev, formData);
    if (result.ok) toast.success("Activity logged");
    return result;
  }, {});
  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="grid gap-3">
      {"contact_id" in target ? (
        <input type="hidden" name="contact_id" value={target.contact_id} />
      ) : (
        <input type="hidden" name="opportunity_id" value={target.opportunity_id} />
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field name="type" label="Type" errors={errors.type}>
          <NativeSelect {...fieldProps("type", errors.type)} defaultValue={state.values?.type ?? "call"} className="w-full">
            {ACTIVITY_TYPES.map((t) => (
              <NativeSelectOption key={t} value={t}>
                {ACTIVITY_TYPE_LABELS[t]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field name="occurred_at" label="Date (MYT)" errors={errors.occurred_at}>
          <Input
            {...fieldProps("occurred_at", errors.occurred_at)}
            type="datetime-local"
            defaultValue={state.values?.occurred_at ?? now}
            required
          />
        </Field>
      </div>
      <Field name="description" label="Description" errors={errors.description}>
        <Textarea
          {...fieldProps("description", errors.description)}
          defaultValue={state.values?.description ?? ""}
          placeholder="What happened?"
          rows={3}
          required
        />
      </Field>
      {(state.message || errors.contact_id) && (
        <p className="text-sm text-destructive">{state.message ?? errors.contact_id?.[0]}</p>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Logging…" : "Log activity"}
        </Button>
      </div>
    </form>
  );
}
