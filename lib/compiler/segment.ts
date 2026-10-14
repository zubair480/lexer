import { z } from "zod";
import type { Clause } from "@/shared/contract";
import { llmStructured } from "@/lib/server/llm";

/**
 * Splits a guideline document into clauses.
 *
 * Accepted heading forms (one per line):
 *   ### 3.1 Block billing        (any markdown level, "#".."######")
 *   ## 3.1. Block billing
 *   3.1 Block billing —          (bare numbered heading needs a dotted number like 3.1)
 *   3.1 Block billing — body text on the same line
 *
 * Clause text = body after the heading up to the next heading (any markdown heading, or
 * another numbered heading) or EOF, trimmed. start/end are offsets into sourceText such that
 * sourceText.slice(start, end) === text (CRLF-safe: we never normalise the source).
 */

const MD_HEADING = /^[ \t]{0,3}#{1,6}[ \t]+/;
// markdown numbered heading: "### 3.1 Title", "## 3 Title", "### §3.1. Title"
const MD_NUMBERED = /^[ \t]{0,3}#{1,6}[ \t]+(?:§[ \t]*)?(\d+(?:\.\d+)*)\.?[ \t]*[—–:\-.]?[ \t]*(.*)$/;
// bare numbered heading: requires dotted number "3.1"
const BARE_NUMBERED = /^[ \t]{0,3}(?:§[ \t]*)?(\d+(?:\.\d+)+)\.?[ \t]+(.*)$/;

interface Heading {
  lineStart: number; // offset of start of heading line
  bodyStart: number; // offset where the clause body begins
  number: string | null; // null => non-numbered markdown heading (terminates a clause)
  title: string;
}

/** For a bare line "3.1 Title — inline body", decide whether it is a heading and split title/body. */
function parseTitleAndInline(rest: string): { title: string; inlineIdx: number | null } {
  // dash separator (em/en dash, or " - ") splits title from optional inline body
  const m = /[ \t]*(?:—|–|[ \t]-[ \t])[ \t]*/.exec(rest);
  if (m) {
    const title = rest.slice(0, m.index).trim();
    const after = m.index + m[0].length;
    const inline = rest.slice(after);
    return { title, inlineIdx: inline.trim().length > 0 ? after : null };
  }
  return { title: rest.trim().replace(/[:.]$/, ""), inlineIdx: null };
}

function findHeadings(src: string): Heading[] {
  const out: Heading[] = [];
  let pos = 0;
  while (pos <= src.length) {
    let nl = src.indexOf("\n", pos);
    if (nl === -1) nl = src.length;
    let line = src.slice(pos, nl);
    if (line.endsWith("\r")) line = line.slice(0, -1);
    const next = nl + 1;

    const md = MD_NUMBERED.exec(line);
    if (md) {
      const restOffset = line.length - md[2].length; // index of title text within line
      const { title, inlineIdx } = parseTitleAndInline(md[2]);
      out.push({
        lineStart: pos,
        bodyStart: inlineIdx !== null ? pos + restOffset + inlineIdx : Math.min(next, src.length),
        number: md[1],
        title,
      });
    } else if (MD_HEADING.test(line)) {
      out.push({ lineStart: pos, bodyStart: Math.min(next, src.length), number: null, title: line.replace(MD_HEADING, "").trim() });
    } else {
      const bare = BARE_NUMBERED.exec(line);
      if (bare) {
        const rest = bare[2];
        const restOffset = line.length - rest.length;
        const { title, inlineIdx } = parseTitleAndInline(rest);
        // a bare numbered line is a heading only if its title is short-ish (not a full sentence paragraph)
        const isHeading = inlineIdx !== null || (title.length > 0 && title.length <= 80 && !/[.;]\s*\S/.test(title));
        if (isHeading) {
          out.push({
            lineStart: pos,
            bodyStart: inlineIdx !== null ? pos + restOffset + inlineIdx : Math.min(next, src.length),
            number: bare[1],
            title,
          });
        }
      }
    }
    if (nl >= src.length) break;
    pos = next;
  }
  return out;
}

function trimRange(src: string, start: number, end: number): [number, number] {
  while (start < end && /\s/.test(src[start])) start++;
  while (end > start && /\s/.test(src[end - 1])) end--;
  return [start, end];
}

function segmentByHeadings(rulebookId: string, src: string): Clause[] {
  const headings = findHeadings(src);
  const clauses: Clause[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    if (h.number === null) continue;
    const limit = i + 1 < headings.length ? headings[i + 1].lineStart : src.length;
    const [start, end] = trimRange(src, h.bodyStart, Math.max(h.bodyStart, limit));
    if (end <= start) continue; // section header with no body (e.g. "## 3 Billing Rules")
    let id = `${rulebookId}__${h.number}`;
    if (seen.has(id)) {
      let k = 2;
      while (seen.has(`${id}_${k}`)) k++;
      id = `${id}_${k}`;
    }
    seen.add(id);
    clauses.push({ id, rulebookId, number: h.number, title: h.title, text: src.slice(start, end), start, end });
  }
  return clauses;
}

const LlmSegmentSchema = z.object({
  clauses: z.array(z.object({ number: z.string(), title: z.string(), text: z.string() })),
});

function locate(src: string, text: string, from: number): { start: number; end: number; text: string } | null {
  const t = text.trim();
  if (!t) return null;
  let idx = src.indexOf(t, from);
  if (idx === -1) idx = src.indexOf(t);
  if (idx !== -1) return { start: idx, end: idx + t.length, text: t };
  // tolerate whitespace / CRLF differences: match on a whitespace-flexible regex
  const words = t.split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (words.length === 0) return null;
  try {
    const re = new RegExp(words.join("\\s+"), "g");
    re.lastIndex = from;
    const m = re.exec(src) ?? new RegExp(words.join("\\s+")).exec(src);
    if (m) return { start: m.index, end: m.index + m[0].length, text: m[0] };
  } catch {
    /* ignore */
  }
  return null;
}

async function segmentWithLlm(rulebookId: string, src: string): Promise<Clause[]> {
  const out = await llmStructured({
    name: "segment_rulebook",
    schema: LlmSegmentSchema,
    system:
      "You split legal guideline documents (outside-counsel billing guidelines, regulatory requirements) into numbered clauses. " +
      "Return every clause that states a rule or requirement, plus any definitions sections, in document order. " +
      "Copy each clause's text VERBATIM from the document (do not paraphrase, do not include the heading). " +
      "If the document has no numbering, number clauses sequentially as 1, 2, 3... Titles are 2-5 words.",
    user: `Document:\n"""\n${src}\n"""\n\nReturn JSON {"clauses":[{"number","title","text"}]}.`,
  });
  const clauses: Clause[] = [];
  const seen = new Set<string>();
  let cursor = 0;
  out.clauses.forEach((c, i) => {
    const number = (c.number || String(i + 1)).trim().replace(/\.$/, "");
    let id = `${rulebookId}__${number}`;
    if (seen.has(id)) id = `${id}_${i}`;
    seen.add(id);
    const loc = locate(src, c.text, cursor);
    if (loc) {
      cursor = loc.end;
      clauses.push({ id, rulebookId, number, title: c.title.trim(), text: loc.text, start: loc.start, end: loc.end });
    } else {
      clauses.push({ id, rulebookId, number, title: c.title.trim(), text: c.text.trim(), start: 0, end: 0 });
    }
  });
  return clauses;
}

export async function segmentRulebook(rulebookId: string, sourceText: string): Promise<Clause[]> {
  const byHeadings = segmentByHeadings(rulebookId, sourceText);
  if (byHeadings.length > 0) return byHeadings;
  if (!sourceText.trim()) return [];
  return segmentWithLlm(rulebookId, sourceText);
}

/** exported for tests */
export const _internal = { findHeadings, segmentByHeadings };
