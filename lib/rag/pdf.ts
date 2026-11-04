import { readFile } from "node:fs/promises";
import { extractText, getDocumentProxy } from "unpdf";

// PDF → clean text lines, each tagged with its 1-based PDF page number, plus the
// document's table of contents (the chunker uses it to recognise headings).

export type Line = { text: string; page: number };
export type CleanDocument = { lines: Line[]; toc: string[] };

/** Raw text of each page, in order. pdf.js keeps line breaks but not blank lines. */
export async function extractPages(path: string): Promise<string[]> {
  // verbosity 0 hides pdf.js font warnings ("TT: undefined function"), which don't affect the text.
  const pdf = await getDocumentProxy(new Uint8Array(await readFile(path)), { verbosity: 0 });
  const { text } = await extractText(pdf, { mergePages: false });
  return text;
}

// Running headers/footers sit in the first few and last few lines of a page.
const HEADER_LINES = 8;
const FOOTER_LINES = 3;
// A line in that zone on at least this share of pages is a running header/footer.
const REPEAT_SHARE = 0.5;

const DOT_LEADER = /(\.\s?){4,}\s*[\divxlc]*\s*$/i; // "2.3.1 Pre-Submission ........ 20"
const CONTENTS_TITLE = /^(table of )?contents?\b.{0,10}$/i; // "CONTENTS Page", "TABLE OF CONTENT"
const PAGE_NUMBER = /^(page )?(#|[ivxlc]+)( of #)?$/; // after normalise(): "#", "ii", "page # of #"

/** Lowercase and replace numbers, so "Page 9 of 26" and "Page 10 of 26" compare equal. */
function normalise(line: string): string {
  return line.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
}

/**
 * Drops what would pollute retrieval: running headers/footers, page numbers and
 * table-of-contents pages. Everything else is kept, in reading order. TOC lines are
 * returned separately, without dot leaders and page numbers.
 */
export function cleanPages(pages: string[]): CleanDocument {
  const split = pages.map((page) =>
    page
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean),
  );

  const edge = (lines: string[]) => [...lines.slice(0, HEADER_LINES), ...lines.slice(-FOOTER_LINES)];

  // How many pages each normalised edge line appears on.
  const seen = new Map<string, number>();
  for (const lines of split) {
    for (const key of new Set(edge(lines).map(normalise))) seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const minRepeats = Math.max(3, Math.ceil(pages.length * REPEAT_SHARE));
  const isBoilerplate = (line: string) => {
    const key = normalise(line);
    return (seen.get(key) ?? 0) >= minRepeats || PAGE_NUMBER.test(key);
  };

  const out: Line[] = [];
  const tocLines: string[] = [];
  split.forEach((lines, index) => {
    const contents = isContentsPage(lines);
    // On a page titled "Contents", the TOC starts at the title (the cover may sit above it).
    const titleAt = lines.findIndex((line) => CONTENTS_TITLE.test(line));
    const footerStart = lines.length - FOOTER_LINES;
    lines.forEach((text, i) => {
      const inEdge = i < HEADER_LINES || i >= footerStart;
      if (inEdge && isBoilerplate(text)) return;
      if (contents) {
        if (i > titleAt) tocLines.push(text);
        return;
      }
      if (DOT_LEADER.test(text)) return;
      out.push({ text, page: index + 1 });
    });
  });
  return { lines: out, toc: tocEntries(tocLines) };
}

/**
 * TOC lines → entries without dot leaders or page numbers, wrapped entries joined:
 * "10. Tax Treatment ... for Micro," + "Small and Medium Companies" + "6"
 */
function tocEntries(lines: string[]): string[] {
  const entries: { text: string; done: boolean }[] = [];
  for (const line of lines) {
    // The page number ends an entry (≤ 3 digits, so "Year of Assessment 2020" survives).
    const done = DOT_LEADER.test(line) || /(^|\s)\d{1,3}$/.test(line);
    const text = line.replace(DOT_LEADER, "").replace(/(^|\s)\d{1,3}$/, "").trim();
    const prev = entries.at(-1);
    const continues =
      prev !== undefined &&
      !/^\d/.test(text) &&
      // no page number yet, a dangling "... – A" / "... ON", or a line starting "(B2B) ..." / "billed ..."
      (!prev.done || /\b(a|an|and|or|of|on|the|to|in|for|by|with)$|[–,-]$/i.test(prev.text) || /^[a-z(–-]/.test(text));
    if (continues) {
      if (text) prev.text = `${prev.text} ${text}`;
      prev.done ||= done;
    } else if (text) {
      entries.push({ text, done });
    }
  }
  // Sentences on the contents page ("Inland Revenue Board of Malaysia.") aren't headings.
  return entries.map((e) => e.text).filter((text) => !/[.,;:]$/.test(text));
}

// A page titled "Contents", or one that is mostly dot-leader lines (a TOC continued from the previous page).
function isContentsPage(lines: string[]): boolean {
  if (lines.some((line) => CONTENTS_TITLE.test(line))) return true;
  const leaders = lines.filter((line) => DOT_LEADER.test(line)).length;
  return lines.length > 0 && leaders / lines.length >= 0.3;
}
