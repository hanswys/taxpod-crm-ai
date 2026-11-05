"use client";

import { CircleAlert, RotateCcw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { confirmNotes, extractNotes } from "@/app/notes/actions";
import { ReviewForm } from "@/components/notes/review-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ContactOption, OpenOpportunity } from "@/lib/notes/match";
import { NOTES_MAX, NOTES_MIN, type ConfirmInput, type ConfirmResult, type Draft } from "@/lib/notes/schema";

type Sample = { id: string; title: string; meetingAt: string; notes: string };
type Step =
  | { kind: "input"; error?: { message: string; retryable: boolean } }
  | { kind: "review"; draft: Draft; result: Extract<ConfirmResult, { ok: false }> | null }
  | { kind: "done"; result: Extract<ConfirmResult, { ok: true }> };

/** Paste → review → saved. The draft lives in the browser until it's confirmed. */
export function NotesWorkspace({
  contacts,
  openOpportunities,
  samples,
  now,
}: {
  contacts: ContactOption[];
  openOpportunities: OpenOpportunity[];
  samples: Sample[];
  now: string;
}) {
  const [notes, setNotes] = useState("");
  const [meetingAt, setMeetingAt] = useState(now);
  const [step, setStep] = useState<Step>({ kind: "input" });
  const [pending, startTransition] = useTransition();

  function runExtract() {
    if (pending) return;
    startTransition(async () => {
      try {
        const result = await extractNotes(notes, meetingAt);
        setStep(result.ok ? { kind: "review", draft: result.draft, result: null } : { kind: "input", error: result });
      } catch {
        setStep({ kind: "input", error: { message: "Couldn't reach the server. Is `npm run dev` running?", retryable: true } });
      }
    });
  }

  function runConfirm(draft: Draft, payload: ConfirmInput) {
    startTransition(async () => {
      let result: ConfirmResult;
      try {
        result = await confirmNotes(payload);
      } catch {
        result = { ok: false, message: "Couldn't reach the server. Nothing was saved." };
      }
      if (result.ok) {
        toast.success("Saved to the CRM");
        setStep({ kind: "done", result });
      } else {
        setStep({ kind: "review", draft, result });
      }
    });
  }

  function startOver() {
    setNotes("");
    setMeetingAt(now);
    setStep({ kind: "input" });
  }

  if (step.kind === "review") {
    return (
      <ReviewForm
        // A fresh form per extraction, so state from an earlier draft never leaks in.
        key={step.draft.noteId ?? 0}
        draft={step.draft}
        contacts={contacts}
        openOpportunities={openOpportunities}
        pending={pending}
        result={step.result}
        onBack={() => setStep({ kind: "input" })}
        onConfirm={(payload) => runConfirm(step.draft, payload)}
      />
    );
  }

  if (step.kind === "done") return <Saved result={step.result} onStartOver={startOver} />;

  const length = notes.trim().length;
  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={"e.g.\nMet Lee Hui Min (Finance Manager, Kampung Baru Bakeries). Interested in e-Invoice training for 6 staff, quoted RM 5,400.\nAction: send proposal by next Wednesday."}
        aria-label="Meeting notes"
        rows={12}
        maxLength={NOTES_MAX}
        className="min-h-64 font-mono text-sm"
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="meeting-at">Meeting date and time</Label>
          <Input id="meeting-at" type="datetime-local" value={meetingAt} onChange={(e) => setMeetingAt(e.target.value)} className="w-56" />
          <p className="text-xs text-muted-foreground">Used to work out dates like &ldquo;next Friday&rdquo;.</p>
        </div>
        <Button onClick={runExtract} disabled={pending || length < NOTES_MIN}>
          <Sparkles />
          {pending ? "Extracting…" : "Extract"}
        </Button>
      </div>

      {step.error && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex items-center gap-2 text-sm text-destructive">
            <CircleAlert className="size-4 shrink-0" />
            {step.error.message}
          </p>
          {step.error.retryable && (
            <Button variant="outline" size="sm" onClick={runExtract} disabled={pending}>
              <RotateCcw />
              Retry
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-2">
        <p className="text-sm text-muted-foreground">Or try a sample:</p>
        <div className="flex flex-wrap gap-2">
          {samples.map((s) => (
            <Button
              key={s.id}
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => {
                setNotes(s.notes);
                setMeetingAt(s.meetingAt);
              }}
            >
              {s.title}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Saved({ result, onStartOver }: { result: Extract<ConfirmResult, { ok: true }>; onStartOver: () => void }) {
  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle>Saved</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        {result.contacts.length > 0 && (
          <ul className="grid gap-1">
            {result.contacts.map((c) => (
              <li key={c.id}>
                {c.action === "created" ? "Created" : "Updated"}{" "}
                <Link href={`/leads/${c.id}`} className="font-medium hover:underline">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {result.opportunities.length > 0 && (
          <ul className="grid gap-1">
            {result.opportunities.map((o) => (
              <li key={o.id}>
                {o.action === "created" ? "Created opportunity" : "Logged against"}{" "}
                <Link href={`/opportunities/${o.id}`} className="font-medium hover:underline">
                  {o.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p>
          Logged {result.activities} {result.activities === 1 ? "activity" : "activities"}. They show on each contact&apos;s
          timeline and in the{" "}
          <Link href="/" className="underline">
            dashboard feed
          </Link>
          .
        </p>
        <div>
          <Button variant="outline" onClick={onStartOver}>
            Extract another
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
