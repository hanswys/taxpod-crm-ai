"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { moveOpportunity } from "@/app/opportunities/actions";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { STAGE_LABELS, STAGES, type Stage } from "@/lib/crm/types";

/** Keyboard/touch-friendly alternative to dragging on the Kanban. Saves on change. */
export function StageSelect({ id, stage }: { id: number; stage: Stage }) {
  const [pending, startTransition] = useTransition();

  return (
    <NativeSelect
      key={stage} // reset to the server value after each save
      aria-label="Stage"
      defaultValue={stage}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        startTransition(async () => {
          const result = await moveOpportunity(id, next);
          if (result.ok) toast.success(`Moved to ${STAGE_LABELS[next as Stage]}`);
          else toast.error(result.message ?? "Could not change stage");
        });
      }}
    >
      {STAGES.map((s) => (
        <NativeSelectOption key={s} value={s}>
          {STAGE_LABELS[s]}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
