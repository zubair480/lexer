// G1 — deterministic clause -> Rule DSL compiler (no LLM). Recognises common billing / compliance
// clause shapes from the text. ACCURACY over coverage: returns null unless a shape is matched confidently.
import type { Condition, RecordType, Rule, Severity } from "@/shared/contract";

export interface TextClause {
  number: string;
  title: string;
  text: string;
  id?: string;
}

export interface PatternResult {
  rule: Rule;
  confidence: number;
  matched: string[];
}

/* ───────────────────────────── helpers ───────────────────────────── */

const NUM_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90, hundred: 100,
};
const NUM = String.raw`(\d+(?:,\d{3})*(?:\.\d+)?|\.\d+|${Object.keys(NUM_WORDS).join("|")})`;

function toNum(s: string): number {
  const t = s.toLowerCase().replace(/,/g, "");
  if (t in NUM_WORDS) return NUM_WORDS[t];
  return Number(t);
}

const JUDGMENT =
  /\b(reasonabl[ey]|unreasonabl[ey]|necessary|unnecessary|appropriate|inappropriate|excessive|customary|adequate|sufficient|prudent|duplicative|proportionate|good faith|professional judgment)\b/i;
const HAS_NUMBER = new RegExp(String.raw`(\d|\b(${Object.keys(NUM_WORDS).join("|")}|half|tenth)\b)`, "i");

const REJECT_WORDS =
  /\b(not billable|non-billable|will be rejected|be rejected|rejected|will not be paid|not be paid|not reimbursable|non-reimbursable|not compensable|will not pay|not be reimbursed|disallowed|prohibited|not permitted|may not be billed|shall not be billed|must not be billed|will not be accepted|written off)\b/i;
const WARN_WORDS = /\b(should|flagged|will be flagged|encouraged|reviewed|discouraged)\b/i;

function severityFrom(text: string, fallback: Severity = "warn"): Severity {
  if (REJECT_WORDS.test(text)) return "reject";
  if (WARN_WORDS.test(text)) return "warn";
  return fallback;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Word-boundary regex for a term with common inflections spelled out (keeps generated tests realistic). */
export function stemPattern(word: string): string {
  const w = word.toLowerCase().trim();
  let m: RegExpMatchArray | null;
  if ((m = w.match(/^(.+?)ying$/))) return `${escapeRe(m[1])}(?:y|ies|ied|ying)`; // copying
  if ((m = w.match(/^(.+[^aeiou])ing$/)) && w.length > 5) {
    const root = m[1];
    // filing -> fil(?:ed|ing)   scheduling -> schedul(?:ed|ing)  (bare "file" intentionally excluded: too ambiguous)
    return `${escapeRe(root)}(?:ed|ing)`;
  }
  if ((m = w.match(/^(.+)ization$/))) return `${escapeRe(m[1])}(?:ization|izations|ize|ized|izes|izing)`;
  if ((m = w.match(/^(.+)ation$/))) return `${escapeRe(m[1])}(?:ation|ations|e|ed|es|ing)`;
  if ((m = w.match(/^(.+[^s])ies$/))) return `${escapeRe(m[1])}(?:y|ies)`;
  if ((m = w.match(/^(.+(?:s|x|ch|sh))es$/))) return `${escapeRe(m[1])}(?:es)?`;
  if ((m = w.match(/^(.+[^s])s$/))) return `${escapeRe(m[1])}s?`;
  if (/(s|x|ch|sh)$/.test(w)) return `${escapeRe(w)}(?:es)?`;
  return `${escapeRe(w)}s?`;
}

function phraseRegex(phrase: string): string {
  const words = phrase.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  const head = words.slice(0, -1).map((w) => (/[^aeiou]ing$/.test(w) && w.length > 5 ? stemPattern(w) : escapeRe(w)));
  const last = stemPattern(words[words.length - 1]);
  return [...head, last].join(String.raw`\s+`);
}

function firstSentence(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  const m = t.match(/^(.+?[.!?])(\s|$)/);
  const s = (m ? m[1] : t).replace(/[.!?]$/, "");
  return s.length > 180 ? `${s.slice(0, 177)}...` : s;
}

const ACTIVITY_CODE = /\b(A1\d\d)\b/gi;
const TASK_CODE = /\b([LBCPE]\d\d\d)\b/g;

function codesIn(text: string): { activity: string[]; task: string[] } {
  const activity = Array.from(new Set((text.match(ACTIVITY_CODE) ?? []).map((c) => c.toUpperCase())));
  const task = Array.from(new Set((text.match(TASK_CODE) ?? []).map((c) => c.toUpperCase()))).filter((c) => !/^A/.test(c));
  return { activity, task };
}

function codeCond(field: "activityCode" | "taskCode", codes: string[]): Condition {
  return codes.length === 1 ? { field, op: "eq", value: codes[0] } : { field, op: "in", value: codes };
}

function anyOf(conds: Condition[]): Condition {
  return conds.length === 1 ? conds[0] : { any: conds };
}

/** Known activity topics -> condition on activity code and/or narrative. */
interface Topic {
  key: string;
  test: RegExp;
  code?: string;
  narrative: string;
}
const TOPICS: Topic[] = [
  { key: "travel", test: /\btravel/i, code: "A110", narrative: String.raw`\btravel(?:ed|ing|led|ling)?\b` },
  {
    key: "attendance",
    test: /\b(attend\w*)\b.*\b(deposition|meeting|hearing)s?\b|\b(deposition|meeting)s?\b.*\battendance\b/i,
    code: "A109",
    narrative: String.raw`\battend(ed|ing|ance)?\b.*\b(deposition|meeting)\b`,
  },
  { key: "research", test: /\bresearch/i, code: "A102", narrative: String.raw`\bresearch(?:ed|ing)?\b` },
  {
    key: "internal conference",
    test: /\binternal (conference|meeting|call)s?\b|\bintra-?(office|firm)\b|\bconferences? between (firm )?(attorneys|lawyers|timekeepers)\b/i,
    code: "A105",
    narrative: String.raw`\binternal\s+(?:conference|meeting|call)s?\b|\bintra-?(?:office|firm)\b`,
  },
];

function topicCondition(phrase: string): { cond: Condition; key: string } | null {
  const codes = codesIn(phrase);
  const conds: Condition[] = [];
  let key = "";
  if (codes.activity.length) conds.push(codeCond("activityCode", codes.activity));
  if (codes.task.length) conds.push(codeCond("taskCode", codes.task));
  for (const t of TOPICS) {
    if (t.test.test(phrase)) {
      if (t.code && !codes.activity.includes(t.code)) conds.push({ field: "activityCode", op: "eq", value: t.code });
      conds.push({ field: "narrative", op: "matches", value: t.narrative });
      key = t.key;
      break;
    }
  }
  if (!conds.length) return null;
  return { cond: anyOf(conds), key: key || "codes" };
}

const ROLE_WORDS: Array<[RegExp, string]> = [
  [/\bpartners?\b/i, "partner"],
  [/\bassociates?\b/i, "associate"],
  [/\bparalegals?\b/i, "paralegal"],
];
function roleIn(text: string): string | null {
  const hits = ROLE_WORDS.filter(([re]) => re.test(text)).map(([, r]) => r);
  return hits.length === 1 ? hits[0] : null;
}

const PER_DAY = /\b(per day|a day|each day|in a (single )?day|in any (single )?day|daily|per calendar day|on any day|same day)\b/i;

/* ───────────────────────────── pattern matchers ───────────────────────────── */

interface Draft {
  title?: string;
  severity: Severity;
  scope: "entry" | "group";
  when?: Condition;
  violation: Rule["violation"];
  adjustment?: Rule["adjustment"];
  confidence: number;
  matched: string[];
}

function h1bPatterns(t: string): Draft | null {
  const sev = severityFrom(t, "reject");
  if (/\bwage\b/i.test(t) && /\bprevailing\b/i.test(t) && /(greater than or equal|at least|not (be )?less than|equal to or (greater|higher)|no less than|below|meet or exceed|not be lower)/i.test(t)) {
    return { severity: sev, scope: "entry", violation: { field: "offeredWage", op: "lt_field", value: "lcaPrevailingWage" }, confidence: 0.95, matched: ["wage>=prevailing"] };
  }
  if (/\bzip\b/i.test(t) && /\b(listed|one of|included|appear)\b/i.test(t)) {
    return { severity: sev, scope: "entry", violation: { field: "worksiteZip", op: "not_in_field", value: "lcaWorksiteZips" }, confidence: 0.95, matched: ["zip in LCA list"] };
  }
  let m = t.match(new RegExp(String.raw`(?:no more than|not more than|not earlier than|at most|within)\s+${NUM}\s+(?:calendar\s+)?days?\s+(?:before|prior to)`, "i"));
  if (m) return { severity: sev, scope: "entry", violation: { field: "daysBeforeStart", op: "gt", value: toNum(m[1]) }, confidence: 0.9, matched: ["filing window max days"] };
  m = t.match(new RegExp(String.raw`(?:more than)\s+${NUM}\s+(?:calendar\s+)?days?\s+(?:before|prior to)`, "i"));
  if (m && /\b(may not|must not|cannot|shall not|not be)\b/i.test(t)) {
    return { severity: sev, scope: "entry", violation: { field: "daysBeforeStart", op: "gt", value: toNum(m[1]) }, confidence: 0.85, matched: ["filing window max days"] };
  }
  m = t.match(new RegExp(String.raw`(?:at least|no fewer than|no less than|not less than)\s+${NUM}\s+(?:calendar\s+)?days?\s+(?:before|prior to)`, "i"));
  if (m) return { severity: sev, scope: "entry", violation: { field: "daysBeforeStart", op: "lt", value: toNum(m[1]) }, confidence: 0.85, matched: ["filing window min days"] };
  return null;
}

function blockBilling(t: string): Draft | null {
  if (!/\b(multiple|more than one|several|two or more) tasks?\b|\bblock[- ]?bill|\bsingle task\b|\bone task\b/i.test(t)) return null;
  const segment: Condition = { field: "narrative", op: "segment_count_gt", value: 1 };
  const m = t.match(new RegExp(String.raw`(?:exceed(?:s|ing)?|more than|over|in excess of|longer than)\s+${NUM}\s*(?:hours?|hrs?)`, "i"));
  const violation: Condition = m ? { all: [{ field: "hours", op: "gt", value: toNum(m[1]) }, segment] } : segment;
  return { severity: severityFrom(t, "warn"), scope: "entry", violation, confidence: 0.9, matched: m ? ["block billing", "hours threshold"] : ["block billing"] };
}

function vagueNarrative(t: string): Draft | null {
  const conds: Condition[] = [];
  const matched: string[] = [];
  const wc = t.match(new RegExp(String.raw`(?:under|fewer than|less than|below|shorter than)\s+${NUM}\s+words?`, "i"));
  if (wc) {
    conds.push({ field: "narrative", op: "word_count_lt", value: toNum(wc[1]) });
    matched.push("word count");
  }
  const atLeast = t.match(new RegExp(String.raw`(?:at least|no fewer than|minimum of)\s+${NUM}\s+words?`, "i"));
  if (!wc && atLeast) {
    conds.push({ field: "narrative", op: "word_count_lt", value: toNum(atLeast[1]) });
    matched.push("word count");
  }
  const quoted = [
    ...Array.from(t.matchAll(/["“”]([^"“”]{3,60})["“”]/g)),
    ...Array.from(t.matchAll(/(?:^|[\s(])'([^']{3,60})'(?=[\s,.;:)]|$)/g)),
  ].map((m) => m[1].trim().toLowerCase());
  const phrases = quoted.filter((p) => /[a-z]/.test(p) && !/^\d/.test(p));
  if (phrases.length && /\b(narrative|description|entr(y|ies)|phrase|terms?|using|use|containing|contain)\b/i.test(t)) {
    conds.push({ field: "narrative", op: "contains_any", value: Array.from(new Set(phrases)) });
    matched.push("quoted phrases");
  }
  if (!conds.length) return null;
  return { severity: severityFrom(t, "warn"), scope: "entry", violation: anyOf(conds), confidence: 0.9, matched };
}

function staffing(t: string): Draft | null {
  const m = t.match(new RegExp(String.raw`(?:no more than|not more than|at most|more than|maximum of|limited to)\s+${NUM}\s+(?:\w+\s+)?(timekeepers?|attorneys?|lawyers?|people|persons|individuals|billers|professionals)`, "i"));
  if (!m) return null;
  const isMoreThan = /^more than/i.test(m[0]);
  if (isMoreThan && !/\b(may not|must not|shall not|cannot|will not|not)\b/i.test(t)) return null;
  if (!/\b(same|per|each|single)\b/i.test(t)) return null;
  const n = toNum(m[1]);
  const topic = topicCondition(t);
  return {
    severity: severityFrom(t, "warn"),
    scope: "group",
    when: topic?.cond,
    violation: { groupBy: ["date"], fn: "count_distinct", field: "timekeeperId", op: "gt", value: n },
    confidence: topic ? 0.9 : 0.75,
    matched: ["staffing limit", ...(topic ? [`topic:${topic.key}`] : [])],
  };
}

function rateFactor(t: string): Draft | null {
  let factor: number | null = null;
  const m = t.match(/(\d+(?:\.\d+)?)\s*(%|percent)\s+(?:of\s+)?(?:the\s+)?(?:\w+'s\s+|\w+\s+){0,3}(?:standard\s+|normal\s+|hourly\s+|regular\s+|billing\s+)?rate/i);
  if (m) factor = Number(m[1]) / 100;
  else if (/\b(half|one-half)\s+(?:of\s+)?(?:the\s+)?(?:\w+'s\s+|\w+\s+){0,3}rate\b/i.test(t)) factor = 0.5;
  if (factor === null || !(factor > 0 && factor < 1)) return null;
  if (!/\b(billed|charged|paid|reimbursed|compensated)\b/i.test(t)) return null;
  const topic = topicCondition(t);
  if (!topic) return null; // must know WHICH entries get the reduced rate
  return {
    severity: "reduce",
    scope: "entry",
    when: topic.cond,
    violation: { field: "rate", op: "gt", value: 0 },
    adjustment: { type: "rate_factor", factor: Math.round(factor * 1000) / 1000 },
    confidence: 0.9,
    matched: ["rate factor", `topic:${topic.key}`],
  };
}

function increments(t: string): Draft | null {
  if (!/\bincrements?\b|\bunits? of\b/i.test(t)) return null;
  let step: number | null = null;
  if (/\b(tenth|one-tenth|1\/10|0?\.1)\b|\bsix[- ]minute|\b6[- ]minute/i.test(t)) step = 0.1;
  else if (/\b(quarter[- ]hour|0?\.25|fifteen[- ]minute|15[- ]minute)\b/i.test(t)) step = 0.25;
  if (step === null) return null;
  return {
    severity: severityFrom(t, "warn"),
    scope: "entry",
    violation: { field: "hours", op: "not_multiple_of", value: step },
    confidence: 0.9,
    matched: ["billing increment"],
  };
}

function rateCap(t: string): Draft | null {
  const m =
    t.match(/\brates?\b[^.]*?\b(?:may not|must not|shall not|cannot|will not|not to|should not|not)\s+exceed\s+\$\s?([\d,]+(?:\.\d+)?)/i) ??
    t.match(/\brates?\b[^.]*?\b(?:above|over|in excess of|greater than|higher than)\s+\$\s?([\d,]+(?:\.\d+)?)/i) ??
    t.match(/\$\s?([\d,]+(?:\.\d+)?)\s*(?:per hour|\/\s?h(?:ou)?r|an hour)[^.]*\b(?:maximum|cap)\b/i) ??
    t.match(/\b(?:maximum|cap(?:ped)?)\b[^.]*?\brate\b[^.]*?\$\s?([\d,]+(?:\.\d+)?)/i);
  if (!m) return null;
  const cap = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(cap) || cap <= 0) return null;
  const role = roleIn(t);
  return {
    severity: severityFrom(t, "warn"),
    scope: "entry",
    when: role ? { field: "role", op: "eq", value: role } : undefined,
    violation: { field: "rate", op: "gt", value: cap },
    confidence: 0.9,
    matched: ["rate cap", ...(role ? [`role:${role}`] : [])],
  };
}

function hourCap(t: string): Draft | null {
  const m = t.match(new RegExp(String.raw`(?:more than|exceed(?:s|ing)?|in excess of|over|greater than|no more than|not more than|at most|maximum of|longer than)\s+${NUM}\s*(?:hours?|hrs?)\b`, "i"));
  if (!m) return null;
  const n = toNum(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  // A cap must be stated as a limit (prohibition or "no more than").
  if (!/^no\b|\bno (timekeeper|attorney|lawyer|one|person|entry|entries|professional)s?\b|\b(no more than|not more than|may not|must not|shall not|cannot|will not|not exceed|not to exceed|at most|maximum|limited|will be (flagged|rejected|reviewed)|require|not billable|not be paid)\b/i.test(t)) return null;
  // Optional topic: "8 hours of research"
  const ofTopic = t.match(new RegExp(String.raw`${NUM}\s*(?:hours?|hrs?)\s+(?:of|on|for)\s+([a-z][a-z\s-]{2,40}?)(?:\s+(?:per|a|each|in|on|by)\b|[.,;]|$)`, "i"));
  let when: Condition | undefined;
  const matched = ["hour cap"];
  if (ofTopic) {
    const topic = topicCondition(ofTopic[2]);
    if (topic) {
      when = topic.cond;
      matched.push(`topic:${topic.key}`);
    } else if (!/\b(this matter|the matter|any matter|all matters|work|time|billable)\b/i.test(ofTopic[2])) {
      return null; // unknown topic: not confident
    }
  }
  const codes = codesIn(t);
  if (!when && (codes.activity.length || codes.task.length)) {
    const cs: Condition[] = [];
    if (codes.activity.length) cs.push(codeCond("activityCode", codes.activity));
    if (codes.task.length) cs.push(codeCond("taskCode", codes.task));
    when = anyOf(cs);
    matched.push("codes");
  }
  const role = roleIn(t);
  if (role) {
    const rc: Condition = { field: "role", op: "eq", value: role };
    when = when ? { all: [rc, when] } : rc;
    matched.push(`role:${role}`);
  }
  if (PER_DAY.test(t)) {
    return {
      severity: severityFrom(t, "warn"),
      scope: "group",
      when,
      violation: { groupBy: ["timekeeperId", "date"], fn: "sum", field: "hours", op: "gt", value: n },
      confidence: 0.9,
      matched: [...matched, "per timekeeper per day"],
    };
  }
  if (/\b(per week|weekly|per month|monthly|per invoice|total)\b/i.test(t)) return null; // periods we can't group on
  return {
    severity: severityFrom(t, "warn"),
    scope: "entry",
    when,
    violation: { field: "hours", op: "gt", value: n },
    confidence: 0.85,
    matched: [...matched, "per entry"],
  };
}

const PROHIBITION = String.raw`(?:is|are)\s+(?:considered\s+)?(?:\w+\s+(?:and|or)\s+)?(?:not billable|non-billable|not reimbursable|non-reimbursable|not compensable|not permitted|prohibited|disallowed|not chargeable|not payable)`;

/** "Filing, copying, scheduling, and document organization are clerical and not billable" */
function listedTerms(t: string): Draft | null {
  const sent = t.split(/(?<=[.;])\s+/);
  for (const s of sent) {
    const m = s.match(new RegExp(String.raw`^\s*(.+?)\s+(?:${PROHIBITION}|(?:is|are)\s+(?:considered\s+)?(?:clerical|administrative|overhead)\b.*?(?:not billable|non-billable|not reimbursable|will not be paid|not be billed|may not be billed))`, "i"));
    if (!m) continue;
    const subject = m[1].replace(/^(all|any|the|time spent on|time for|charges for|fees for)\s+/i, "");
    const parts = subject.split(/\s*,\s*|\s+(?:and|or)\s+/i).map((p) => p.replace(/^(and|or)\s+/i, "").trim()).filter(Boolean);
    if (parts.length < 2) continue;
    if (parts.some((p) => p.split(/\s+/).length > 3)) return null;
    const alts = parts.map((p) => {
      const words = p.toLowerCase().split(/\s+/);
      // "document organization" -> the activity word carries the meaning
      return words.length === 2 && /^(document|documents|file|files|paper|records?)$/.test(words[0]) ? stemPattern(words[1]) : phraseRegex(p);
    });
    const codes = codesIn(subject);
    const conds: Condition[] = [{ field: "narrative", op: "matches", value: String.raw`\b(?:${alts.join("|")})\b` }];
    if (codes.activity.length) conds.unshift(codeCond("activityCode", codes.activity));
    return { severity: severityFrom(s, "reject"), scope: "entry", violation: anyOf(conds), confidence: 0.85, matched: ["listed non-billable terms"] };
  }
  return null;
}

/** "Internal conferences between firm attorneys are not billable" / "Overtime for secretarial staff is not reimbursable" */
function singleProhibition(t: string): Draft | null {
  const m =
    t.match(new RegExp(String.raw`^\s*(?:time (?:spent )?(?:on|for)\s+|charges for\s+|fees for\s+)?(.+?)\s+${PROHIBITION}`, "i")) ??
    t.match(/\b(?:may not|must not|shall not|will not|cannot)\s+(?:bill|charge)\s+(?:for\s+)?(.+?)[.;]/i) ??
    t.match(/\bwill not (?:pay|reimburse)\s+(?:for\s+)?(.+?)[.;]/i);
  if (!m) return null;
  let subject = m[1].trim().replace(/^(all|any|the)\s+/i, "").replace(/^(time spent (on|in|for)?|time (on|for)|charges for|fees for)\s*/i, "");
  if (/,/.test(subject)) return null;
  // codes named in the subject => code condition
  const codes = codesIn(subject);
  const topic = topicCondition(subject);
  if (topic && topic.key !== "codes") {
    return { severity: "reject", scope: "entry", violation: topic.cond, confidence: 0.8, matched: ["prohibited activity", `topic:${topic.key}`] };
  }
  if (codes.activity.length || codes.task.length) {
    const cs: Condition[] = [];
    if (codes.activity.length) cs.push(codeCond("activityCode", codes.activity));
    if (codes.task.length) cs.push(codeCond("taskCode", codes.task));
    return { severity: "reject", scope: "entry", violation: anyOf(cs), confidence: 0.85, matched: ["prohibited codes"] };
  }
  // head phrase: cut at the first qualifier
  subject = subject.split(/\s+(?:between|for|by|of|with|on|in|to|regarding|among|that|which|from|when|where|incurred|performed|billed|related)\b/i)[0].trim();
  let words = subject.split(/\s+/).filter(Boolean);
  if (words.length > 1 && /^(time|work|services|fees|charges|hours)$/i.test(words[words.length - 1])) words = words.slice(0, -1);
  subject = words.join(" ");
  if (!words.length || words.length > 3) return null;
  if (words.some((w) => !/^[a-z][a-z-]*$/i.test(w))) return null;
  if (words.length === 1 && /^(time|work|entries|entry|tasks?|services?|charges?|fees?|expenses?|it|this)$/i.test(words[0])) return null;
  return {
    severity: "reject",
    scope: "entry",
    violation: { field: "narrative", op: "matches", value: String.raw`\b${phraseRegex(subject)}\b` },
    confidence: 0.7,
    matched: ["prohibited activity (narrative phrase)"],
  };
}

function timeEntryPatterns(t: string): Draft | null {
  // Order matters: most specific shapes first.
  return (
    blockBilling(t) ??
    rateFactor(t) ??
    increments(t) ??
    rateCap(t) ??
    staffing(t) ??
    vagueNarrative(t) ??
    hourCap(t) ??
    listedTerms(t) ??
    singleProhibition(t)
  );
}

/* ───────────────────────────── entry point ───────────────────────────── */

export function compileFromText(clause: TextClause, recordType: RecordType): PatternResult | null {
  const text = (clause.text ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  // Judgment standard with no objective threshold => human review.
  if (JUDGMENT.test(text) && !HAS_NUMBER.test(text) && !/["“”]/.test(text)) return null;

  const draft = recordType === "h1b_petition" ? h1bPatterns(text) : timeEntryPatterns(text);
  if (!draft) return null;

  const clauseId = clause.id ?? "";
  const rule: Rule = {
    id: clauseId ? `rule_${clauseId}` : "",
    clauseId,
    title: clause.title?.trim() || draft.matched[0],
    severity: draft.severity,
    scope: draft.scope,
    recordType,
    violation: draft.violation,
    message: `Violates §${clause.number}: ${firstSentence(text)}.`,
  };
  if (draft.when) rule.when = draft.when;
  if (draft.adjustment) rule.adjustment = draft.adjustment;
  return { rule, confidence: draft.confidence, matched: draft.matched };
}
