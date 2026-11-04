"use client";

import { SendHorizontal } from "lucide-react";
import { useState, useTransition } from "react";
import { askQuestion } from "@/app/ask/actions";
import { AnswerCard, type Entry } from "@/components/rag/answer-card";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { DOC_TYPE_LABELS, type DocType } from "@/lib/rag/sources";

const EXAMPLES: { question: string; docType: DocType | "" }[] = [
  { question: "Who is exempt from issuing e-Invoices?", docType: "" },
  { question: "What is the tax rate for an SME company?", docType: "" },
  { question: "Is service tax charged on legal services?", docType: "sst" },
  { question: "What is the corporate income tax rate in Singapore?", docType: "" }, // not covered: shows the refusal
];

/**
 * Question box + this session's answers, newest first. Each question is answered on its
 * own (no conversation memory); the list lives in the browser and clears on reload.
 */
export function AskPanel() {
  const [question, setQuestion] = useState("");
  const [docType, setDocType] = useState<DocType | "">("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [pending, startTransition] = useTransition();

  function submit(q: string, type: DocType | "", replaceId?: number) {
    const text = q.trim();
    if (!text || pending) return;
    const id = replaceId ?? Date.now();
    const entry: Entry = { id, question: text, docType: type, result: null };
    setEntries((list) => (replaceId ? list.map((e) => (e.id === id ? entry : e)) : [entry, ...list]));
    if (!replaceId) setQuestion("");
    startTransition(async () => {
      let result: Entry["result"];
      try {
        result = await askQuestion(text, type);
      } catch {
        result = { kind: "error", message: "Couldn't reach the server. Is `npm run dev` running?", retryable: true };
      }
      setEntries((list) => list.map((e) => (e.id === id ? { ...e, result } : e)));
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit(question, docType);
        }}
      >
        <Textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit(question, docType);
            }
          }}
          placeholder="Ask about e-Invoicing, SST or income tax, e.g. Who must issue e-Invoices from 2026?"
          aria-label="Your tax question"
          rows={2}
          maxLength={500}
          className="resize-none text-base"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Search in
            <NativeSelect
              value={docType}
              onChange={(event) => setDocType(event.target.value as DocType | "")}
              aria-label="Document type"
            >
              <NativeSelectOption value="">All documents</NativeSelectOption>
              {(Object.keys(DOC_TYPE_LABELS) as DocType[]).map((type) => (
                <NativeSelectOption key={type} value={type}>
                  {DOC_TYPE_LABELS[type]}
                  {type === "public_ruling" ? "s" : ""}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <Button type="submit" disabled={pending || question.trim().length < 3}>
            <SendHorizontal />
            {pending ? "Answering…" : "Ask"}
          </Button>
        </div>
      </form>

      {entries.length === 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Try one of these:</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <Button
                key={example.question}
                variant="outline"
                size="sm"
                className="h-auto py-1.5 text-left whitespace-normal"
                onClick={() => submit(example.question, example.docType)}
              >
                {example.question}
                {example.docType && <span className="text-muted-foreground">({DOC_TYPE_LABELS[example.docType]})</span>}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map((entry) => (
            <AnswerCard
              key={entry.id}
              entry={entry}
              onRetry={pending ? undefined : () => submit(entry.question, entry.docType, entry.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
