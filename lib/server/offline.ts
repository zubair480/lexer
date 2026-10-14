// B14 — deterministic offline "LLM" so the full demo runs with NO API key.
// Used by lib/server/llm.ts when there is no OPENAI_API_KEY (cache miss) or LLM_MODE=offline.
// Handlers are keyed on the llmStructured `name` used by the compiler / suggest code:
//   classify_clause (B6), compile_rule + repair_rule (B7), suggest_fix (B11).
import { readFileSync } from "node:fs";
import path from "node:path";
import { compileFromText } from "@/lib/compiler/patterns";
import { generateTests } from "@/lib/compiler/testgen";

export type OfflineOpts = { name: string; system: string; user: string };

type AnyRule = Record<string, unknown> & { clauseId?: string; title?: string; recordType?: string };
type AnyTest = { name: string; expectFlagged: boolean; records: Record<string, unknown>[] };

/* ───────────────────────────── data loading ───────────────────────────── */

let refCache: Record<string, AnyRule[]> | null = null;
let testsCache: Record<string, AnyTest[]> | null = null;

function dataPath(file: string): string {
  return path.join(process.cwd(), "data", file);
}

function referenceRules(): Record<string, AnyRule[]> {
  // Re-read each time in dev would be nicer for hot edits, but keep it cheap: cache per process.
  if (!refCache) refCache = JSON.parse(readFileSync(dataPath("reference-rules.json"), "utf8"));
  return refCache!;
}

function offlineTests(): Record<string, AnyTest[]> {
  if (!testsCache) testsCache = JSON.parse(readFileSync(dataPath("offline-tests.json"), "utf8"));
  return testsCache!;
}

/** Test hook: forget cached data files and demo-repair state. */
export function resetOfflineState(): void {
  refCache = null;
  testsCache = null;
  flawedAt.clear();
  seededText = null;
}

/* ───────────────────────────── parsing helpers ───────────────────────────── */

function clauseNumber(user: string): string | null {
  const m =
    user.match(/Clause\s+§?\s*(\d+(?:\.\d+)+)/i) ??
    user.match(/GUIDELINE CLAUSE\s+§?\s*(\d+(?:\.\d+)+)/i) ??
    user.match(/§\s*(\d+(?:\.\d+)+)/);
  return m ? m[1] : null;
}

function recordType(user: string): "time_entry" | "h1b_petition" | null {
  const m = user.match(/Record type:\s*(time_entry|h1b_petition)/i);
  return m ? (m[1].toLowerCase() as "time_entry" | "h1b_petition") : null;
}

function clauseTitle(user: string): string {
  const m = user.match(/Clause\s+§?\s*\d+(?:\.\d+)*\s*(?:—|-)?\s*"?([^"\n]+?)"?\s*:?\s*$/im);
  return m ? m[1].trim() : "";
}

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

function findReference(num: string | null, rt: string | null, title: string): AnyRule | null {
  const all = Object.values(referenceRules()).flat();
  const pool = rt ? all.filter((r) => !r.recordType || r.recordType === rt) : all;
  if (num) {
    const hit = pool.find((r) => String(r.clauseId ?? "").endsWith(`__${num}`));
    if (hit) return hit;
  }
  if (title) {
    const t = title.toLowerCase();
    const hit = pool.find((r) => String(r.title ?? "").toLowerCase() === t);
    if (hit) return hit;
  }
  return null;
}

/* ───────────────────────────── classify_clause ───────────────────────────── */

const CLASSIFY_REASONS: Record<string, string> = {
  "3.1": "Objective test: an entry over 0.5 hours whose narrative combines multiple tasks can be detected from hours and narrative.",
  "3.2": "Objective test: narratives under five words or containing the listed generic phrases can be detected from the narrative text.",
  "3.3": "Objective test: count distinct timekeepers billing A109 deposition/meeting attendance on the same day against the limit of two.",
  "3.4": "Objective test: non-working travel entries (activity code A110 or travel-time narratives) can be priced at 50% of the billed rate.",
  "3.5": "Objective test: filing, copying, scheduling and document-organization tasks can be detected from narrative keywords.",
  "3.6": "Objective test: sum each timekeeper's hours per day and compare against the 10-hour cap.",
  "3.7": "Turns on \"reasonable and necessary\" with no objective threshold, so it needs attorney judgment and will not be auto-enforced.",
  "4.1": "Objective test: compare the offered wage to the prevailing wage on the certified LCA.",
  "4.2": "Objective test: check the worksite ZIP code against the ZIP codes listed on the certified LCA.",
  "4.3": "Objective test: compute days between filing date and requested start date and compare against the 180-day window.",
};

const JUDGMENT_WORDS =
  /\b(reasonabl[ey]|unreasonabl[ey]|necessary|unnecessary|appropriate|inappropriate|excessive|customary|adequate|sufficient|prudent|duplicative|proportionate)\b/i;
const NUMBER_HINT = /\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|half|percent|hours?|days?)\b/i;
const OBLIGATION =
  /\b(must|shall|will be|will not|may not|not billable|no more than|more than|less than|at least|exceed|rejected|prohibited|required|only|billed at)\b/i;

function classifyBody(user: string): string {
  const m = user.match(/"""\n?([\s\S]*?)\n?"""/);
  return m ? m[1] : user;
}

function handleClassify(user: string): { kind: "compilable" | "judgment" | "informational"; reason: string } {
  const num = clauseNumber(user);
  const body = classifyBody(user);
  const title = clauseTitle(user);
  if (!num) {
    return { kind: "informational", reason: "Introductory text that states no checkable obligation on individual records." };
  }
  const judgment = body.match(JUDGMENT_WORDS);
  if (num === "3.7" || (judgment && !NUMBER_HINT.test(body))) {
    const word = judgment ? judgment[0].toLowerCase() : "reasonable";
    return {
      kind: "judgment",
      reason:
        CLASSIFY_REASONS[num] && num === "3.7"
          ? CLASSIFY_REASONS[num]
          : `Turns on "${word}" with no objective threshold, so it needs attorney judgment and will not be auto-enforced.`,
    };
  }
  if (CLASSIFY_REASONS[num]) return { kind: "compilable", reason: CLASSIFY_REASONS[num] };
  if (!OBLIGATION.test(`${title} ${body}`)) {
    return { kind: "informational", reason: "States no checkable obligation on billed records." };
  }
  return {
    kind: "compilable",
    reason: `States an objective requirement${title ? ` on ${title.toLowerCase()}` : ""} that can be checked mechanically against record fields.`,
  };
}

/* ───────────────────────────── compile_rule / repair_rule ───────────────────────────── */

const DEMO_FLAW_CLAUSE = "3.2";
const FLAW_WINDOW_MS = 60_000;
const flawedAt = new Map<string, number>();

/** Deliberately flawed 3.2 rule: drops "attention to" and uses word_count_lt 3 so tests fail and repair runs. */
function flawRule(rule: AnyRule): AnyRule {
  const r = clone(rule);
  const v = r.violation as { any?: Array<{ field: string; op: string; value: unknown }> } | undefined;
  if (v && Array.isArray(v.any)) {
    for (const leaf of v.any) {
      if (leaf.op === "word_count_lt") leaf.value = 3;
      if (leaf.op === "contains_any" && Array.isArray(leaf.value)) {
        leaf.value = (leaf.value as string[]).filter((p) => p.toLowerCase() !== "attention to");
      }
    }
  }
  return r;
}

/** G1: clause body from a compile/repair prompt: the lines after `Clause §N "Title":` up to the first blank line. */
function clauseBody(user: string): string {
  const lines = user.split(/?
/);
  const i = lines.findIndex((l) => /^Clause\s+§/i.test(l.trim()));
  if (i < 0) return "";
  const out: string[] = [];
  for (const l of lines.slice(i + 1)) {
    if (!l.trim()) break;
    out.push(l);
  }
  return out.join("
").trim();
}

let seededText: string | null = null;
function squash(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}
/** Reference rules only apply to clauses that actually come from the seeded rulebooks. */
function isSeededClause(body: string): boolean {
  if (!body) return true; // can't tell: keep legacy behaviour
  if (seededText === null) {
    seededText = ["acme-ocg.md", "uscis-h1b.md"]
      .map((f) => {
        try {
          return squash(readFileSync(dataPath(f), "utf8"));
        } catch {
          return "";
        }
      })
      .join("
");
  }
  return seededText.includes(squash(body));
}

/** G1: deterministic text -> DSL compiler + generated tests for clauses without a reference rule. */
function compileFromClauseText(user: string, num: string | null, rt: "time_entry" | "h1b_petition" | null, title: string) {
  const body = clauseBody(user);
  const res = body ? compileFromText({ number: num ?? "?", title, text: body }, rt ?? "time_entry") : null;
  if (!res) throw new Error(`offline: no confident deterministic rule for clause ${num ?? "(unknown)"} — needs human review`);
  const tests = generateTests(res.rule, rt ?? "time_entry");
  const pos = tests.filter((t) => t.expectFlagged).length;
  if (pos < 2 || tests.length - pos < 2) throw new Error(`offline: could not generate enough tests for clause ${num ?? "(unknown)"}`);
  return { rule: { ...(res.rule as unknown as AnyRule), id: "", clauseId: "" }, tests: tests as AnyTest[] };
}

function compileOutput(user: string, opts: { allowFlaw: boolean }): { rule: AnyRule; tests: AnyTest[] } {
  const num = clauseNumber(user);
  const rt = recordType(user);
  const title = clauseTitle(user);
  const ref = isSeededClause(clauseBody(user)) ? findReference(num, rt, title) : null;
  if (!ref) return compileFromClauseText(user, num, rt, title);
  const key = num ?? String(ref.clauseId ?? "");
  const tests = offlineTests()[key.replace(/^.*__/, "")] ?? offlineTests()[key];
  if (!tests) throw new Error(`offline: no fixture tests for clause ${key}`);

  // LLM-shaped rule: id/clauseId left blank (the compiler assigns them).
  let rule: AnyRule = { ...clone(ref), id: "", clauseId: "" };

  if (opts.allowFlaw && num === DEMO_FLAW_CLAUSE) {
    const now = Date.now();
    const last = flawedAt.get(num);
    if (last === undefined || now - last > FLAW_WINDOW_MS) {
      flawedAt.set(num, now);
      rule = flawRule(rule);
    }
  }
  return { rule, tests: clone(tests) };
}

/* ───────────────────────────── suggest_fix ───────────────────────────── */

type SuggestOut = {
  explanation: string;
  narrative?: string | null;
  splitEntries?: Array<{ narrative: string; hours: number; taskCode?: string | null; activityCode?: string | null }> | null;
};

const TASK_CONTEXT: Record<string, string> = {
  L110: "for the Acme fact investigation",
  L120: "for the Acme case strategy",
  L140: "for the Acme document review",
  L160: "for the Acme settlement evaluation",
  L210: "for the Acme pleadings",
  L310: "for Acme written discovery",
  L330: "for Acme deposition preparation",
  L350: "for the Acme discovery motions",
};

const VAGUE_REWRITE: Record<string, string> = {
  L110: "Analyzed witness interview notes to build fact chronology for Acme litigation",
  L120: "Reviewed case file to prepare status summary for Acme general counsel",
  L140: "Reviewed custodian email set to tag responsive Acme pricing documents",
  L160: "Analyzed damages exposure to prepare settlement range memo for Acme",
  L210: "Revised draft answer to amended complaint for Acme review",
  L310: "Reviewed plaintiff's interrogatory responses to identify deficiencies for meet-and-confer",
  L330: "Prepared outline for upcoming deposition of plaintiff's expert witness",
  L350: "Analyzed opposing brief to outline reply arguments on motion to compel",
};

function parseEntry(user: string): Record<string, unknown> | null {
  const idx = user.indexOf("TIME ENTRY:");
  const start = user.indexOf("{", idx >= 0 ? idx : 0);
  const end = user.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(user.slice(start, end + 1));
  } catch {
    return null;
  }
}

function splitTasks(narrative: string): string[] {
  const parts: string[] = [];
  for (const chunk of narrative.split(/;/)) {
    // split on " and " only when the next word looks like a new task verb (past tense), e.g. "...and called client"
    const sub = chunk.split(/\s+and\s+(?=[a-z]+ed\b)/i);
    for (const s of sub) {
      const t = s.trim().replace(/[.\s]+$/, "");
      if (t) parts.push(t);
    }
  }
  return parts;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Distribute total hours over n parts in 0.1 steps; the last part absorbs the remainder (sums exactly). */
export function distributeHours(total: number, n: number): number[] {
  const tenths = Math.round(total * 10);
  const k = Math.max(1, Math.min(n, tenths));
  const base = Math.floor(tenths / k);
  const out: number[] = [];
  for (let i = 0; i < k - 1; i++) out.push(base / 10);
  out.push((tenths - base * (k - 1)) / 10);
  return out;
}

function handleSuggest(user: string): SuggestOut {
  const num = clauseNumber(user);
  const violation = (user.match(/VIOLATION[^\n]*/) ?? [""])[0];
  const entry = parseEntry(user) ?? {};
  const narrative = String(entry.narrative ?? "");
  const hours = Number(entry.hours ?? 0);
  const taskCode = String(entry.taskCode ?? "");
  const ctx = TASK_CONTEXT[taskCode] ?? "for the Acme matter";

  const isBlock = num === "3.1" || /block/i.test(violation);
  const isVague = num === "3.2" || /vague/i.test(violation);

  if (isBlock) {
    const tasks = splitTasks(narrative);
    if (tasks.length >= 2 && hours > 0) {
      const hrs = distributeHours(hours, tasks.length);
      const used = tasks.slice(0, hrs.length);
      if (used.length < tasks.length) used[used.length - 1] = tasks.slice(hrs.length - 1).join("; ");
      return {
        explanation: `Split the block-billed entry into ${used.length} single-task entries; hours still total ${hours.toFixed(1)}.`,
        splitEntries: used.map((t, i) => {
          let n = capitalize(t);
          if (wordCount(n) < 5) n = `${n} ${ctx}`;
          return { narrative: n, hours: hrs[i], taskCode: entry.taskCode as string, activityCode: entry.activityCode as string };
        }),
      };
    }
    return {
      explanation: "The narrative could not be separated into distinct tasks automatically; ask the timekeeper to itemize each task with its own time.",
    };
  }

  if (isVague) {
    const rewrite = VAGUE_REWRITE[taskCode] ?? "Analyzed open issues in the Acme matter to prepare next-step recommendations for the client";
    return {
      explanation: `Replaced the generic narrative "${narrative}" with a specific description of the ${taskCode || "billed"} task so the client can evaluate the work.`,
      narrative: rewrite,
    };
  }

  const EXPLAIN: Record<string, string> = {
    "3.3": "No narrative fix applies: more than two timekeepers attended the same event. Write off the time of the least-necessary attendee.",
    "3.4": "No narrative fix applies: non-working travel must be billed at 50% of the standard rate. Reduce the entry's rate by half.",
    "3.5": "No narrative fix applies: clerical work is not billable regardless of who performed it. Remove the entry from the invoice.",
    "3.6": "No narrative fix applies: the timekeeper exceeded the 10-hour daily cap. Write down the hours above 10 for that day.",
  };
  return {
    explanation:
      (num && EXPLAIN[num]) ??
      "No narrative rewrite can cure this violation; the firm should write down, reduce, or remove the entry as the guideline requires.",
  };
}

/* ───────────────────────────── entry point ───────────────────────────── */

export async function offlineRespond(opts: OfflineOpts): Promise<unknown> {
  const { name, user } = opts;
  switch (name) {
    case "classify_clause":
      return handleClassify(user);
    case "compile_rule":
      return compileOutput(user, { allowFlaw: true });
    case "repair_rule":
      return compileOutput(user, { allowFlaw: false });
    case "suggest_fix":
      return handleSuggest(user);
    default:
      throw new Error(`offline: no handler for ${name}`);
  }
}
