import { CircleAlert, ExternalLink, FileSearch, LoaderCircle, RotateCcw } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AskResult, Citation, NotFoundReason } from "@/lib/rag/answer";
import type { Passage } from "@/lib/rag/retrieve";
import { DOC_TYPE_LABELS, type DocType } from "@/lib/rag/sources";
import { cn } from "@/lib/utils";

export type Entry = { id: number; question: string; docType: DocType | ""; result: AskResult | null };

export function AnswerCard({ entry, onRetry }: { entry: Entry; onRetry?: () => void }) {
  const { question, docType, result } = entry;

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-base leading-snug">{question}</CardTitle>
        {docType && <p className="text-xs text-muted-foreground">Searched: {DOC_TYPE_LABELS[docType]} documents only</p>}
      </CardHeader>
      <CardContent className="space-y-4">
        {result === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Searching the documents and writing an answer…
          </p>
        ) : result.kind === "error" ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex items-center gap-2 text-sm text-destructive">
              <CircleAlert className="size-4 shrink-0" />
              <InlineCode text={result.message} />
            </p>
            {result.retryable && onRetry && (
              <Button variant="outline" size="sm" onClick={onRetry}>
                <RotateCcw />
                Retry
              </Button>
            )}
          </div>
        ) : result.kind === "not_found" ? (
          <>
            <div className="rounded-md border border-dashed bg-muted/40 p-3 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <FileSearch className="size-4 shrink-0" />
                Not in the documents
              </p>
              <p className="mt-1 text-muted-foreground">{result.message}</p>
              <p className="mt-2 text-xs text-muted-foreground">{notFoundExplanation(result.reason, result.passages)}</p>
            </div>
            <Passages passages={result.passages} citations={[]} />
          </>
        ) : (
          <>
            <AnswerText text={result.answer} citations={result.citations} />
            <Sources citations={result.citations} />
            <Passages passages={result.passages} citations={result.citations} />
            <p className="text-xs text-muted-foreground">
              {result.model} · {(result.ms / 1000).toFixed(1)} s · AI-generated from the cited documents; check the
              source before advising a client.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function notFoundExplanation(reason: NotFoundReason, passages: Passage[]): string {
  switch (reason) {
    case "low_similarity":
      return `No passage was a close enough match (best ${passages[0]?.similarity.toFixed(2)}), so the AI wasn't asked.`;
    case "model_declined":
      return `The AI read the ${passages.length} closest passages and found no answer in them.`;
    case "no_valid_citations":
      return "The AI's answer didn't cite any of the passages it was given, so it was withheld.";
  }
}

/**
 * Renders the model's answer: paragraphs, "- " bullet lists (indent = nesting), **bold**,
 * *italic*, and [n] citation markers as links to the cited page.
 */
function AnswerText({ text, citations }: { text: string; citations: Citation[] }) {
  const byNumber = new Map(citations.map((c) => [c.n, c]));
  const blocks: ReactNode[] = [];
  let list: { indent: number; content: string }[] = [];

  const flushList = () => {
    if (list.length === 0) return;
    blocks.push(
      <ul key={blocks.length} className="space-y-1">
        {list.map((item, i) => (
          <li key={i} className="flex gap-2" style={{ paddingLeft: `${Math.min(item.indent, 2) * 1.25}rem` }}>
            <span className="text-muted-foreground">•</span>
            <span>{inline(item.content, byNumber)}</span>
          </li>
        ))}
      </ul>,
    );
    list = [];
  };

  for (const line of text.split("\n")) {
    const bullet = line.match(/^(\s*)[-*•]\s+(.*)$/);
    if (bullet) {
      list.push({ indent: Math.floor(bullet[1].length / 2), content: bullet[2] });
    } else {
      flushList();
      if (line.trim()) blocks.push(<p key={blocks.length}>{inline(line, byNumber)}</p>);
    }
  }
  flushList();

  return <div className="space-y-3 text-sm leading-relaxed">{blocks}</div>;
}

function inline(text: string, byNumber: Map<number, Citation>): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[\d+\])/g).map((part, i) => {
    const marker = part.match(/^\[(\d+)\]$/);
    if (marker) {
      const citation = byNumber.get(Number(marker[1]));
      return citation ? <CitationMarker key={i} citation={citation} /> : null;
    }
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (/^\*[^*]+\*$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

function CitationMarker({ citation }: { citation: Citation }) {
  return (
    <a
      href={citation.href}
      target="_blank"
      rel="noreferrer"
      title={`${citation.shortTitle}${citation.section ? ` · ${citation.section}` : ""} · ${pages(citation)}`}
      className="mx-0.5 inline-flex h-4 min-w-4 -translate-y-0.5 items-center justify-center rounded bg-primary/10 px-1 align-middle text-[10px] font-medium text-primary hover:bg-primary hover:text-primary-foreground"
    >
      {citation.n}
    </a>
  );
}

function Sources({ citations }: { citations: Citation[] }) {
  return (
    <div className="border-t pt-3">
      <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Sources</p>
      <ol className="space-y-1.5 text-sm">
        {citations.map((c) => (
          <li key={c.n} className="flex gap-2">
            <span className="w-5 shrink-0 text-muted-foreground">[{c.n}]</span>
            <span className="min-w-0">
              <a href={c.href} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                {c.shortTitle}
                <ExternalLink className="ml-1 inline size-3 align-baseline text-muted-foreground" />
              </a>
              {c.section && <span className="text-muted-foreground"> · {c.section}</span>}
              <span className="text-muted-foreground"> · {pages(c)}</span>
              {c.publishedOn && <span className="text-xs text-muted-foreground"> (as at {formatDay(c.publishedOn)})</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Everything that was sent to the model, with scores: makes retrieval inspectable. */
function Passages({ passages, citations }: { passages: Passage[]; citations: Citation[] }) {
  if (passages.length === 0) return null;
  const citedAs = new Map(citations.map((c) => [c.rank, c.n]));
  return (
    <details className="group text-sm">
      <summary className="cursor-pointer text-xs text-muted-foreground select-none hover:text-foreground">
        Show retrieved passages ({passages.length})
      </summary>
      <ol className="mt-3 space-y-3">
        {passages.map((p, i) => {
          const n = citedAs.get(i + 1);
          return (
            <li key={p.chunkId} className={cn("rounded-md border p-3", n === undefined && "opacity-70")}>
              <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span className="font-medium">#{i + 1}</span>
                <Badge variant="secondary" className="font-mono">
                  {p.similarity.toFixed(3)}
                </Badge>
                <a href={`/${p.filePath}#page=${p.pageStart}`} target="_blank" rel="noreferrer" className="hover:underline">
                  {p.shortTitle} · {p.section ?? "no section"} · {pages(p)}
                </a>
                {n !== undefined && <Badge>cited as [{n}]</Badge>}
              </div>
              <p className="max-h-40 overflow-y-auto text-xs leading-relaxed whitespace-pre-line text-muted-foreground">
                {p.content}
              </p>
            </li>
          );
        })}
      </ol>
    </details>
  );
}

function InlineCode({ text }: { text: string }) {
  return (
    <span>
      {text.split(/(`[^`]+`)/g).map((part, i) =>
        part.startsWith("`") ? (
          <code key={i} className="rounded bg-muted px-1 font-mono text-xs">
            {part.slice(1, -1)}
          </code>
        ) : (
          part
        ),
      )}
    </span>
  );
}

function pages(p: { pageStart: number; pageEnd: number }): string {
  return p.pageStart === p.pageEnd ? `p. ${p.pageStart}` : `pp. ${p.pageStart}–${p.pageEnd}`;
}

function formatDay(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
