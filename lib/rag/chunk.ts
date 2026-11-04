import type { CleanDocument, Line } from "@/lib/rag/pdf";

// Clean lines → section-aware chunks. Pure: no I/O, no API calls.
//
// 1. Rebuild paragraphs: pdf.js gives wrapped lines with no blank lines between
//    paragraphs, so a paragraph starts at a numbered/lettered marker, or after a
//    line that ends a sentence.
// 2. Find headings by matching the document's own table of contents in the body.
//    A document without a TOC gets no section labels, only size-based chunks.
// 3. Pack paragraphs into chunks up to maxChars. A top-level heading always starts
//    a new chunk; a sub-heading does if the current chunk is already half full.
//    Consecutive chunks in a section share one short paragraph (overlap).

export const CHUNK_OPTIONS = {
  maxChars: 1500, // ~375 tokens
  minChars: 200, // smaller chunks merge into the previous one in the same section
  overlapMaxChars: 500, // the last paragraph is repeated in the next chunk if it's this short
};

export type Chunk = {
  content: string;
  pageStart: number;
  pageEnd: number;
  section: string | null; // nearest heading, e.g. "1.6 Exemptions from implementing e-Invoice"
  sectionPath: string[]; // all enclosing headings, outermost first (embedded with the chunk)
};

const MIN_USEFUL_CHARS = 50;

type Block = { text: string; pageStart: number; pageEnd: number; heading?: { level: number } };

const NUMBERED = /^(\d{1,2}(?:\.\d{1,2}){0,3})\.?\s+(\S.*)$/; // "4.3.1. Type of establishment"
// "5. ", "5.1 ", "14.6.1 " start a paragraph; "90 days after ..." doesn't.
const NUMBERED_PARA = /^\d{1,3}(?:(?:\.\d{1,2}){1,3}\.?|\.)\s+\S/;
const LETTERED = /^\((?:[a-z]{1,2}|[ivxlc]{1,6}|\d{1,2})\)\s*\S/i; // "(a)", "(iv)", "(2)"
const BULLET = /^[•●▪◦\-–]\s/;
const LABEL = /^(Example|Table|Figure|Note|Diagram)\b/i;
const SENTENCE_END = /[.:;?!]["”’)]?$/;

function isBlockStart(text: string): boolean {
  return NUMBERED_PARA.test(text) || LETTERED.test(text) || BULLET.test(text) || LABEL.test(text);
}

function isAllCaps(text: string): boolean {
  const letters = text.replace(/[^A-Za-z]/g, "");
  return letters.length >= 6 && letters.replace(/[^A-Z]/g, "").length / letters.length >= 0.9;
}

/** "Relevant Provisions of The Law" → "relevantprovisionsofthelaw": ignores case, spacing, punctuation. */
function key(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Like key() but keeps case, so "taxable services" in a sentence doesn't match "TAXABLE SERVICES". */
function caseKey(text: string): string {
  return text.replace(/[^A-Za-z0-9]/g, "");
}

/** 1 = top level: "4.", "1.0", ALL CAPS, "Appendix". "1.6" is 2, "2.3.1" is 3; Title Case is 2. */
function levelOf(text: string): number {
  const numbered = NUMBERED.exec(text);
  if (numbered) {
    const parts = numbered[1].split(".");
    return parts.length === 2 && parts[1] === "0" ? 1 : parts.length; // "1.0 INTRODUCTION" is top level
  }
  return isAllCaps(text) || /^appendix\b/i.test(text) ? 1 : 2;
}

// Numbered TOC entries are matched by number + the start of the title, because the
// wording differs a little between TOC and body ("6. Allowable Deductions" vs
// "6. Allowable Deduction"). Unnumbered ones (RMCD guides) must match in full.
const TITLE_PREFIX = 12;
type Headings = { numbered: Map<string, string>; unnumbered: Set<string> };

function headingsFrom(toc: string[]): Headings {
  const headings: Headings = { numbered: new Map(), unnumbered: new Set() };
  for (const entry of toc) {
    if (LABEL.test(entry)) continue; // lists of figures and tables
    const numbered = NUMBERED.exec(entry);
    if (numbered) headings.numbered.set(numbered[1], key(numbered[2]));
    // A lone Title Case word is too likely to match a table cell; ALL CAPS ones are real headings.
    else if (/^[A-Z]/.test(entry) && (entry.includes(" ") || isAllCaps(entry))) headings.unnumbered.add(caseKey(entry));
  }
  return headings;
}

/** If a heading starts at line `i`: its level and how many lines it spans (headings can wrap). */
function matchHeading(lines: Line[], i: number, headings: Headings): { level: number; span: number } | null {
  const text = lines[i].text;
  const next = lines[i + 1]?.text ?? "";

  const numbered = NUMBERED.exec(text);
  if (numbered) {
    const title = headings.numbered.get(numbered[1]);
    if (title === undefined || !key(`${numbered[2]} ${next}`).startsWith(title.slice(0, TITLE_PREFIX))) return null;
    const wraps = next !== "" && !isBlockStart(next) && title.startsWith(key(`${numbered[2]} ${next}`));
    return { level: levelOf(text), span: wraps ? 2 : 1 };
  }

  // Not a heading quoted in the text ("“Remission of Penalty”") or ending a sentence.
  if (/^["“‘]/.test(text) || /[.,;:]$/.test(text)) return null;
  if (headings.unnumbered.has(caseKey(text))) return { level: levelOf(text), span: 1 };
  if (next && headings.unnumbered.has(caseKey(`${text} ${next}`))) return { level: levelOf(text), span: 2 };
  return null;
}

function joinLines(a: string, b: string): string {
  return /[A-Za-z]-$/.test(a) && /^[a-z]/.test(b) ? a + b : `${a} ${b}`;
}

function toBlocks({ lines, toc }: CleanDocument): Block[] {
  const headings = headingsFrom(toc);
  const blocks: Block[] = [];
  let current: Block | null = null;

  for (let i = 0; i < lines.length; i++) {
    const { text, page } = lines[i];

    const heading = matchHeading(lines, i, headings);
    if (heading) {
      const last = lines[i + heading.span - 1];
      blocks.push({
        text: heading.span === 2 ? `${text} ${last.text}` : text,
        pageStart: page,
        pageEnd: last.page,
        heading: { level: heading.level },
      });
      i += heading.span - 1;
      current = null;
      continue;
    }

    const startsNew = !current || isBlockStart(text) || (SENTENCE_END.test(lines[i - 1].text) && /^["“‘(A-Z0-9]/.test(text));
    if (startsNew || !current) {
      current = { text, pageStart: page, pageEnd: page };
      blocks.push(current);
    } else {
      current.text = joinLines(current.text, text);
      current.pageEnd = page;
    }
  }
  return blocks;
}

/** Splits a paragraph longer than `max` at sentence ends, or at spaces as a last resort. */
function splitLong(block: Block, max: number): Block[] {
  if (block.text.length <= max) return [block];
  const sentences = block.text.match(/[^.;!?]+(?:[.;!?]+["”’)]?\s*|$)/g) ?? [block.text];
  const pieces: string[] = [];
  let piece = "";
  for (const sentence of sentences.flatMap((s) => (s.length > max ? s.match(new RegExp(`.{1,${max}}(\\s|$)`, "g")) ?? [s] : [s]))) {
    if (piece && piece.length + sentence.length > max) {
      pieces.push(piece.trim());
      piece = "";
    }
    piece += sentence;
  }
  if (piece.trim()) pieces.push(piece.trim());
  // Page of each piece isn't known exactly; the paragraph's page range is a safe bound.
  return pieces.map((text) => ({ text, pageStart: block.pageStart, pageEnd: block.pageEnd }));
}

export function chunkDocument(doc: CleanDocument, options = CHUNK_OPTIONS): Chunk[] {
  const { maxChars, minChars, overlapMaxChars } = options;
  const chunks: Chunk[] = [];
  let path: { text: string; level: number }[] = [];
  let parts: Block[] = [];
  let carried = 0; // leading blocks of `parts` repeated from the previous chunk (overlap)
  let chunkPath = path; // headings in force where the chunk's new content starts

  const size = (blocks: Block[]) => blocks.reduce((n, b) => n + b.text.length + 2, 0);
  const flush = (overlap: boolean) => {
    // Skip chunks that are only headings (e.g. a table caption printed below its table).
    if (parts.slice(carried).some((p) => !p.heading)) {
      chunks.push({
        content: parts.map((p) => p.text).join("\n\n"),
        pageStart: Math.min(...parts.map((p) => p.pageStart)),
        pageEnd: Math.max(...parts.map((p) => p.pageEnd)),
        section: chunkPath.at(-1)?.text ?? null,
        sectionPath: chunkPath.map((h) => h.text),
      });
    }
    const last = parts.at(-1);
    const keep = overlap && last && parts.length > 1 && !last.heading && last.text.length <= overlapMaxChars;
    parts = keep ? [last] : [];
    carried = parts.length;
    chunkPath = path;
  };
  const add = (block: Block) => {
    if (parts.length === carried) chunkPath = path;
    parts.push(block);
  };

  for (const block of toBlocks(doc)) {
    if (block.heading) {
      const { level } = block.heading;
      // A new top-level section always starts a chunk; a sub-section does once the chunk is half full.
      if (level === 1 || size(parts) >= maxChars / 2 || parts.length === carried) flush(false);
      path = [...path.filter((h) => h.level < level), { text: block.text, level }];
      add(block);
      continue;
    }
    for (const piece of splitLong(block, maxChars)) {
      if (size(parts) + piece.text.length > maxChars) {
        // Never flush a heading on its own: it stays with the paragraph that follows it.
        if (parts.slice(carried).some((p) => !p.heading)) flush(true);
        // The overlap doesn't fit next to a long paragraph: drop it.
        if (carried > 0 && size(parts) + piece.text.length > maxChars) {
          parts = [];
          carried = 0;
        }
      }
      add(piece);
    }
  }
  flush(false);

  // Fold tiny chunks into the previous chunk of the same section; drop scraps
  // too short to answer anything (e.g. "SERVICE TAX 2018 GUIDE ON:" from a cover).
  const merged: Chunk[] = [];
  for (const chunk of chunks) {
    const prev = merged.at(-1);
    if (chunk.content.length < MIN_USEFUL_CHARS) continue;
    if (
      prev &&
      chunk.content.length < minChars &&
      prev.section === chunk.section &&
      prev.content.length + chunk.content.length <= maxChars * 1.3
    ) {
      prev.content += `\n\n${chunk.content}`;
      prev.pageEnd = Math.max(prev.pageEnd, chunk.pageEnd);
    } else {
      merged.push(chunk);
    }
  }
  return merged;
}

/** What gets embedded: document title and heading path give a short chunk its context. */
export function embeddingText(title: string, chunk: Chunk): string {
  const heading = chunk.sectionPath.length ? `\n${chunk.sectionPath.join(" › ")}` : "";
  return `${title}${heading}\n\n${chunk.content}`;
}
