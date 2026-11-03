"use client";

import { XIcon } from "lucide-react";
import { useTransition } from "react";
import { deleteActivityAction } from "@/app/activities/actions";
import { Button } from "@/components/ui/button";

/** Small inline delete; activities are low-stakes, so no confirm dialog. */
export function DeleteActivityButton({ id }: { id: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
      aria-label="Delete activity"
      disabled={pending}
      onClick={() => startTransition(() => deleteActivityAction(id))}
    >
      <XIcon />
    </Button>
  );
}
