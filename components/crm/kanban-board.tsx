"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { moveOpportunity } from "@/app/opportunities/actions";
import { STAGE_DOT } from "@/components/crm/badges";
import { cn } from "@/lib/utils";
import { formatRM } from "@/lib/format";
import { CLOSED_STAGES, STAGE_LABELS, STAGES, type Opportunity, type Stage } from "@/lib/crm/types";

/**
 * Opportunities grouped by stage. Drag a card to another column to change its stage
 * (native HTML5 drag-and-drop). The card moves straight away (optimistic) and snaps back
 * if the save fails. Keyboard/touch users change stage on the opportunity's page instead.
 */
export function KanbanBoard({ opportunities }: { opportunities: Opportunity[] }) {
  const [items, moveOptimistic] = useOptimistic(opportunities, (state, move: { id: number; stage: Stage }) =>
    state.map((o) => (o.id === move.id ? { ...o, stage: move.stage, updated_at: new Date() } : o)),
  );
  const [, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState<Stage | null>(null);

  function drop(stage: Stage, id: number) {
    setDragOver(null);
    const card = items.find((o) => o.id === id);
    if (!card || card.stage === stage) return;
    startTransition(async () => {
      moveOptimistic({ id, stage });
      const result = await moveOpportunity(id, stage);
      if (!result.ok) toast.error(result.message ?? "Could not move the opportunity");
    });
  }

  return (
    <div className="grid auto-cols-[minmax(12rem,1fr)] grid-flow-col gap-3 overflow-x-auto pb-4">
      {STAGES.map((stage) => {
        const cards = items
          .filter((o) => o.stage === stage)
          .sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime() || b.id - a.id);
        const total = cards.reduce((sum, o) => sum + o.value_rm, 0);
        const closed = CLOSED_STAGES.includes(stage);

        return (
          <section
            key={stage}
            aria-label={STAGE_LABELS[stage]}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (dragOver !== stage) setDragOver(stage);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              drop(stage, Number(e.dataTransfer.getData("text/plain")));
            }}
            className={cn(
              "flex min-h-64 min-w-0 flex-col rounded-xl border bg-muted/40 p-2 transition-colors",
              closed && "bg-muted/20",
              dragOver === stage && "border-primary/50 bg-primary/5",
            )}
          >
            <header className="px-1.5 pt-1 pb-2">
              <h2 className="flex items-center gap-2 text-sm font-medium">
                <span className={cn("size-2 rounded-full", STAGE_DOT[stage])} aria-hidden />
                {STAGE_LABELS[stage]}
                <span className="text-muted-foreground tabular-nums">{cards.length}</span>
              </h2>
              <p className="mt-0.5 pl-4 text-xs text-muted-foreground tabular-nums">{formatRM(total)}</p>
            </header>
            <ol className="grid grid-cols-1 gap-2">
              {cards.map((o) => (
                <li
                  key={o.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", String(o.id));
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  className="cursor-grab rounded-lg border bg-card p-3 shadow-xs active:cursor-grabbing"
                >
                  <Link
                    href={`/opportunities/${o.id}`}
                    draggable={false}
                    className="text-sm font-medium leading-snug hover:underline"
                  >
                    {o.title}
                  </Link>
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="min-w-0 truncate">{o.contact_name}</span>
                    <span className="shrink-0 font-medium text-foreground tabular-nums">{formatRM(o.value_rm)}</span>
                  </div>
                </li>
              ))}
            </ol>
            {cards.length === 0 && (
              <p className="px-1.5 py-6 text-center text-xs text-muted-foreground">Drop here</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
