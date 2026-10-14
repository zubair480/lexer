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

/* ───────────────────────── Robust segmentation (G2) ─────────────────────────
 * Real-world heading styles: "1.", "1.1", "1.1.1", "Section 4.2 Title", "§ 4.2", "Rule 3:", "Clause 2",
 * "Article IV", markdown "#" headings (numbered or not), ALL-CAPS headings. "(a)"/"a."/"(i)" sub-items
 * are never headings so they fold into the parent clause. Headings with no body (tables of contents,
 * section headers followed directly by sub-headings) produce no clause. A heading whose body is only a
 * bullet list yields one clause per bullet, numbered N.k. Offsets always satisfy slice(start,end)===text.
 */

const OBLIGATION =
  /\b(must|shall|may not|will not|won't|cannot|can not|not (?:be )?billable|not permitted|prohibited|required|is limited to|no more than|not exceed|will be (?:rejected|reduced|disallowed)|should not|not reimbursable)\b/i;
const BULLET = /^[ \t]*(?:[-*•▪◦·–])[ \t]+/;
const SUBITEM = /^[ \t]*(?:\([a-z]{1,3}\)|\([ivx]{1,5}\)|[a-z]\)|[a-z]\.)[ \t]+/i;

type RKind = "num" | "single" | "md" | "caps";
interface RHeading {
  lineStart: number;
  bodyStart: number;
  number: string | null;
  title: string;
  kind: RKind;
}

function autoTitle(text: string): string {
  const words = text.replace(/[*_`]/g, "").split(/\s+/).filter(Boolean).slice(0, 5).join(" ");
  return words.replace(/[.,;:]+$/, "");
}

function cleanTitle(t: string): string {
  return t
    .replace(/[*_`]+/g, "")
    .replace(/[ \t]*(?:\.{2,}|…+|\t+)[ \t]*\d*[ \t]*$/, "") // ToC dot leaders + page number
    .trim()
    .replace(/[:.\-—–]+$/, "")
    .trim();
}

/** Split the remainder of a heading line into title + optional inline body (index into `rest`). */
function splitRest(rest: string): { title: string; inlineIdx: number | null } {
  if (!rest.trim()) return { title: "", inlineIdx: null };
  const dash = /[ \t]*(?:—|–|[ \t]-[ \t])[ \t]*/.exec(rest);
  if (dash && dash.index > 0 && dash.index <= 80) {
    const after = dash.index + dash[0].length;
    return { title: cleanTitle(rest.slice(0, dash.index)), inlineIdx: rest.slice(after).trim() ? after : null };
  }
  // "**Title.** body" / "Title. Body sentence" / "Title: Body sentence"
  const tb = /^(\**[A-Z][^.:!?]{0,70}?\**)[.:][ \t]*\**[ \t]+(?=\S)/.exec(rest);
  if (tb && tb[1].trim().split(/\s+/).length <= 8 && rest.slice(tb[0].length).trim().length > 0) {
    return { title: cleanTitle(tb[1]), inlineIdx: tb[0].length };
  }
  const t = rest.trim();
  const words = t.split(/\s+/).length;
  const sentence = (/[.;]$/.test(t) && words > 4) || (OBLIGATION.test(t) && words >= 4) || words > 14;
  if (sentence) {
    const lead = rest.length - rest.trimStart().length;
    return { title: autoTitle(t), inlineIdx: lead };
  }
  return { title: cleanTitle(t), inlineIdx: null };
}

const R_PATTERNS: { re: RegExp; kind: RKind }[] = [
  { re: /^(?:section|sec\.?|rule|clause|paragraph|para\.?|guideline|item)[ \t]+(\d+(?:\.\d+)*[a-z]?)\.?[ \t]*(?:[—–:\-.][ \t]*)?(.*)$/i, kind: "num" },
  { re: /^§+[ \t]*(\d+(?:\.\d+)*[a-z]?)\.?[ \t]*(?:[—–:\-.][ \t]*)?(.*)$/, kind: "num" },
  { re: /^article[ \t]+([IVXLC]+|\d+)\b\.?[ \t]*(?:[—–:\-.][ \t]*)?(.*)$/i, kind: "num" },
  { re: /^(\d{1,3}(?:\.\d{1,3})+)\.?[ \t]+(?:[—–:\-][ \t]*)?(.*)$/, kind: "num" },
  { re: /^(\d{1,3})\.[ \t]+(.*)$/, kind: "single" },
];
const MD_SINGLE = { re: /^(\d{1,3})\.?[ \t]+(.*)$/, kind: "num" as RKind };

function parseRobustLine(line: string, pos: number, next: number, srcLen: number): RHeading | null {
  let prefix = /^[ \t]{0,3}/.exec(line)![0].length;
  let isMd = false;
  const md = /^#{1,6}[ \t]+/.exec(line.slice(prefix));
  if (md) {
    prefix += md[0].length;
    isMd = true;
  }
  const bold = /^(?:\*\*|__)/.exec(line.slice(prefix));
  if (bold) prefix += bold[0].length;
  const s = line.slice(prefix);
  if (!s.trim()) return null;
  const mk = (number: string | null, title: string, inlineAbs: number | null, kind: RKind): RHeading => ({
    lineStart: pos,
    bodyStart: inlineAbs !== null ? inlineAbs : Math.min(next, srcLen),
    number,
    title,
    kind,
  });

  const pats = isMd ? [...R_PATTERNS.slice(0, 4), MD_SINGLE] : R_PATTERNS;
  for (const { re, kind } of pats) {
    const m = re.exec(s);
    if (!m) continue;
    const rest = m[2];
    const restIdx = line.length - rest.length;
    const { title, inlineIdx } = splitRest(rest);
    if (kind === "single" && inlineIdx === null && !title) return null;
    return mk(m[1], title || m[1], inlineIdx !== null ? pos + restIdx + inlineIdx : null, kind);
  }
  if (isMd) return mk(null, cleanTitle(s), null, "md");
  // ALL-CAPS heading: letters present, no lowercase, short, not a bullet / sub-item
  const t = s.replace(/[*_]+/g, "").trim();
  if (
    t.length >= 4 && t.length <= 80 && !/[a-z]/.test(t) && /[A-Z]{3,}/.test(t) &&
    !/[.;,]$/.test(t) && t.split(/\s+/).length <= 10
  ) {
    return mk(null, cleanTitle(t) || t, null, "caps");
  }
  return null;
}

function findRobustHeadings(src: string): RHeading[] {
  const out: RHeading[] = [];
  let pos = 0;
  while (pos <= src.length) {
    let nl = src.indexOf("\n", pos);
    if (nl === -1) nl = src.length;
    let line = src.slice(pos, nl);
    if (line.endsWith("\r")) line = line.slice(0, -1);
    const h = BULLET.test(line) || SUBITEM.test(line) ? null : parseRobustLine(line, pos, nl + 1, src.length);
    if (h) out.push(h);
    if (nl >= src.length) break;
    pos = nl + 1;
  }
  return out;
}

interface Piece {
  number: string | null;
  title: string;
  start: number;
  end: number;
  kind: RKind;
  parentIdx: number;
}

/** Split a body range into bullet items if (and only if) every non-blank line is a bullet or a continuation. */
function splitBullets(src: string, start: number, end: number): [number, number][] | null {
  const items: [number, number][] = [];
  let pos = start;
  let cur: [number, number] | null = null;
  while (pos < end) {
    let nl = src.indexOf("\n", pos);
    if (nl === -1 || nl > end) nl = end;
    const line = src.slice(pos, nl);
    const b = BULLET.exec(line);
    if (b) {
      if (cur) items.push(cur);
      cur = [pos + b[0].length, nl];
    } else if (line.trim()) {
      if (!cur) return null; // heading has its own text before the bullets
      cur[1] = nl; // continuation / sub-item folds into the bullet
    }
    pos = nl + 1;
  }
  if (cur) items.push(cur);
  return items.length >= 2 ? items : null;
}

function segmentRobust(rulebookId: string, src: string): Clause[] {
  const hs = findRobustHeadings(src);
  if (!hs.length) return [];
  const pieces: Piece[] = [];
  let parentIdx = -1;
  hs.forEach((h, i) => {
    const limit = i + 1 < hs.length ? hs[i + 1].lineStart : src.length;
    const [start, end] = trimRange(src, h.bodyStart, Math.max(h.bodyStart, limit));
    if (h.kind !== "single") parentIdx = i;
    pieces.push({ number: h.number, title: h.title, start, end, kind: h.kind, parentIdx: h.kind === "single" ? parentIdx : -1 });
  });

  const hasNumbered = pieces.some((p) => p.number !== null && p.end > p.start);
  // "1." lists that restart under different parents (or sit under a numbered section) get the parent's number as prefix
  const singles = pieces.filter((p) => p.kind === "single" && p.end > p.start);
  const restarts = singles.filter((p) => p.number === "1").length > 1;
  const underNumbered = singles.length > 0 && singles.every((p) => p.parentIdx >= 0 && pieces[p.parentIdx].number !== null);
  const prefixSingles = restarts || underNumbered;

  const clauses: Clause[] = [];
  const seen = new Set<string>();
  let unnumberedOrd = 0;
  const unnumberedNo = new Map<number, string>();
  const push = (number: string, title: string, start: number, end: number) => {
    let id = `${rulebookId}__${number}`;
    if (seen.has(id)) {
      let k = 2;
      while (seen.has(`${id}_${k}`)) k++;
      id = `${id}_${k}`;
    }
    seen.add(id);
    clauses.push({ id, rulebookId, number, title, text: src.slice(start, end), start, end });
  };

  pieces.forEach((p, i) => {
    if (p.end <= p.start) return; // ToC line / section header with no own body
    let number = p.number;
    if (number === null) {
      // unnumbered (md / caps) heading: a clause only when the doc has no numbered clauses and it states a rule
      if (hasNumbered) return;
      if (!OBLIGATION.test(src.slice(p.start, p.end))) return;
      number = String(++unnumberedOrd);
      unnumberedNo.set(i, number);
    } else if (p.kind === "single" && prefixSingles && p.parentIdx >= 0) {
      const parent = pieces[p.parentIdx];
      const pn = parent.number ?? unnumberedNo.get(p.parentIdx) ?? `S${p.parentIdx + 1}`;
      number = `${pn}.${number}`;
    }
    const bullets = splitBullets(src, p.start, p.end);
    if (bullets) {
      bullets.forEach(([bs, be], k) => {
        const [s2, e2] = trimRange(src, bs, be);
        if (e2 > s2) push(`${number}.${k + 1}`, p.title || autoTitle(src.slice(s2, e2)), s2, e2);
      });
      return;
    }
    push(number, p.title || autoTitle(src.slice(p.start, p.end)), p.start, p.end);
  });
  return clauses;
}

/** Last resort: paragraphs that contain obligation words, numbered P1, P2, … */
function segmentParagraphs(rulebookId: string, src: string): Clause[] {
  const out: Clause[] = [];
  const bounds: number[] = [0];
  const re = /\n[ \t]*\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) bounds.push(m.index + m[0].length);
  bounds.push(src.length);
  for (let i = 0; i + 1 < bounds.length; i++) {
    const [start, end] = trimRange(src, bounds[i], bounds[i + 1]);
    if (end <= start) continue;
    const text = src.slice(start, end);
    if (!OBLIGATION.test(text)) continue;
    const n = out.length + 1;
    out.push({ id: `${rulebookId}__P${n}`, rulebookId, number: `P${n}`, title: autoTitle(text), text, start, end });
  }
  return out;
}

export async function segmentRulebook(rulebookId: string, sourceText: string): Promise<Clause[]> {
  if (!sourceText.trim()) return [];
  const strict = segmentByHeadings(rulebookId, sourceText);
  let robust: Clause[] = [];
  try {
    robust = segmentRobust(rulebookId, sourceText);
  } catch (e) {
    console.error("[segment] robust segmentation failed", e);
  }
  if (strict.length > 0 && robust.length <= strict.length) return strict;
  if (robust.length > 0) return robust;
  try {
    const viaLlm = await segmentWithLlm(rulebookId, sourceText);
    if (viaLlm.length > 0 && viaLlm.every((c) => c.end > c.start)) return viaLlm;
  } catch (e) {
    console.warn("[segment] LLM segmentation failed; using paragraph fallback:", (e as Error).message);
  }
  return segmentParagraphs(rulebookId, sourceText);
}

/** exported for tests */
export const _internal = { findHeadings, segmentByHeadings, segmentRobust, segmentParagraphs, findRobustHeadings };
