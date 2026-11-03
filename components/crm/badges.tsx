import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  CONTACT_STATUS_LABELS,
  STAGE_LABELS,
  type ContactStatus,
  type Stage,
} from "@/lib/crm/types";

const STATUS_VARIANT = { lead: "outline", prospect: "secondary", customer: "default" } as const;

export function StatusBadge({ status }: { status: ContactStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{CONTACT_STATUS_LABELS[status]}</Badge>;
}

/** Colour per stage, shared by the badge and the Kanban column headers. */
export const STAGE_DOT: Record<Stage, string> = {
  new: "bg-slate-400",
  contacted: "bg-sky-500",
  qualified: "bg-violet-500",
  proposal: "bg-amber-500",
  won: "bg-emerald-500",
  lost: "bg-rose-500",
};

export function StageBadge({ stage, className }: { stage: Stage; className?: string }) {
  return (
    <Badge variant="outline" className={cn("gap-1.5", className)}>
      <span className={cn("size-1.5 rounded-full", STAGE_DOT[stage])} aria-hidden />
      {STAGE_LABELS[stage]}
    </Badge>
  );
}
