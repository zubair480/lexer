// G1 — automatic test generator: derives realistic should-flag / should-pass records FROM a rule's
// conditions (boundary values, phrase present vs near-miss, group N+1 vs N), then validates every test
// against the real engine and drops any whose outcome disagrees with the intended expectation.
import type { Aggregate, Condition, Field, RecordType, Rule, RuleTest } from "@/shared/contract";
import { evalCondition, isAggregate, runTests } from "@/lib/engine";

type Rec = Record<string, unknown>;
type Lazy = (r: Rec) => unknown;
type Assign = Record<string, unknown>; // values may be Lazy functions resolved after merge

const TE_BASE: Rec = {
  date: "2026-10-06",
  timekeeperId: "tk_okafor",
  timekeeperName: "Daniel Okafor",
  role: "associate",
  hours: 1.5,
  rate: 620,
  amount: 930,
  taskCode: "L120",
  activityCode: "A104",
  narrative: "Analyzed opposing party document production for privilege issues",
  matterId: "ACME-LIT-0042",
};

const H1B_BASE: Rec = {
  beneficiaryName: "Arjun Mehta",
  employerName: "Acme Corp",
  offeredWage: 118000,
  lcaPrevailingWage: 112000,
  worksiteZip: "94105",
  lcaWorksiteZips: ["94105", "94107"],
  filingDate: "2026-04-15",
  requestedStartDate: "2026-10-01",
};

const TIMEKEEPERS = [
  { timekeeperId: "tk_hale", timekeeperName: "Margaret Hale", role: "partner", rate: 950 },
  { timekeeperId: "tk_okafor", timekeeperName: "Daniel Okafor", role: "associate", rate: 620 },
  { timekeeperId: "tk_nair", timekeeperName: "Priya Nair", role: "paralegal", rate: 280 },
  { timekeeperId: "tk_ortiz", timekeeperName: "Carlos Ortiz", role: "associate", rate: 620 },
  { timekeeperId: "tk_chen", timekeeperName: "Wei Chen", role: "partner", rate: 950 },
  { timekeeperId: "tk_park", timekeeperName: "Grace Park", role: "paralegal", rate: 280 },
];
function timekeeper(i: number) {
  return TIMEKEEPERS[i] ?? { timekeeperId: `tk_${i}`, timekeeperName: `Timekeeper ${i}`, role: "associate", rate: 620 };
}

const NEUTRAL_NARRATIVES = [
  "Analyzed opposing party document production for privilege issues",
  "Drafted responses to second set of interrogatories",
  "Prepared examination outline for defense CFO witness",
  "Reviewed expert report from defense damages consultant",
  "Telephone conference with opposing counsel regarding expert discovery deadlines",
  "Researched case law on spoliation sanctions for opposition brief",
];
const WORDS = ["Reviewed", "plaintiff's", "second", "set", "of", "interrogatories", "regarding", "pricing", "damages", "theory", "for", "upcoming", "mediation", "session", "with", "client"];
const TASKS = ["Drafted motion to compel", "reviewed opposing production", "conferred with client regarding discovery", "revised privilege log", "prepared deposition outline", "updated case chronology"];

const ALT_VALUES: Record<string, unknown[]> = {
  role: ["partner", "associate", "paralegal"],
  activityCode: ["A104", "A103", "A101", "A106", "A102"],
  taskCode: ["L120", "L310", "L210", "L330"],
  timekeeperId: ["tk_okafor", "tk_hale", "tk_nair"],
  date: ["2026-10-06", "2026-10-07"],
  matterId: ["ACME-LIT-0042", "ACME-LIT-0099"],
  worksiteZip: ["94105", "60601", "73301"],
};

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const norm = (v: unknown) => String(v).replace(/\s+/g, " ").trim().toLowerCase();

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  return t.toISOString().slice(0, 10);
}

function delta(field: string, value: number): number {
  if (field === "hours") return 0.1;
  return Number.isInteger(value) ? 1 : 0.1;
}

/* ───────── tiny regex expander: produce literal strings a (simple) regex matches ───────── */

function expandRegex(src: string, limit = 12): string[] {
  let i = 0;
  function parseAlt(): string[] {
    const branches: string[][] = [parseSeq()];
    while (src[i] === "|") {
      i++;
      branches.push(parseSeq());
    }
    return branches.flat().slice(0, limit);
  }
  function parseSeq(): string[] {
    let acc: string[] = [""];
    while (i < src.length && src[i] !== "|" && src[i] !== ")") {
      let atom: string[];
      const c = src[i];
      if (c === "(") {
        i++;
        if (src.startsWith("?:", i)) i += 2;
        atom = parseAlt();
        i++; // ')'
      } else if (c === "\\") {
        const n = src[i + 1];
        i += 2;
        if (n === "b" || n === "B") atom = [""];
        else if (n === "s") atom = [" "];
        else if (n === "w") atom = ["x"];
        else if (n === "d") atom = ["1"];
        else atom = [n];
      } else if (c === "[") {
        const end = src.indexOf("]", i);
        const body = src.slice(i + 1, end);
        atom = [body.replace(/^\^/, "").charAt(0) || "x"];
        i = end + 1;
      } else if (c === ".") {
        atom = [" "];
        i++;
      } else if (c === "^" || c === "$") {
        atom = [""];
        i++;
      } else {
        atom = [c];
        i++;
      }
      // quantifiers
      const q = src[i];
      if (q === "*") {
        i++;
        atom = atom.map((a) => (a === "x" ? "" : a === " " ? " " : ""));
      } else if (q === "+") {
        i++;
      } else if (q === "?") {
        i++;
        atom = [...atom, ""];
      } else if (q === "{") {
        const end = src.indexOf("}", i);
        i = end + 1;
      }
      const next: string[] = [];
      for (const a of acc) for (const b of atom) if (next.length < limit * 4) next.push(a + b);
      acc = next;
    }
    return acc;
  }
  try {
    const out = parseAlt();
    return Array.from(new Set(out.map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => s.length > 0)));
  } catch {
    return [];
  }
}

function regexOk(src: string, text: string): boolean {
  try {
    return new RegExp(src, "i").test(text);
  } catch {
    return false;
  }
}

/* ───────── leaf → assignments ───────── */

function leafVariants(field: string, op: string, value: unknown, want: boolean, rt: RecordType): Assign[] {
  const base = rt === "h1b_petition" ? H1B_BASE : TE_BASE;
  // derived field: daysBeforeStart => set filing/start dates
  if (field === "daysBeforeStart" && typeof value === "number") {
    const filing = "2026-04-01";
    const mk = (days: number): Assign => ({ filingDate: filing, requestedStartDate: addDays(filing, days) });
    const n = value;
    const flips: Record<string, [number[], number[]]> = {
      gt: [[n + 1, n + 45], [n, Math.max(1, n - 60)]],
      gte: [[n, n + 30], [n - 1, Math.max(1, n - 60)]],
      lt: [[n - 1, Math.max(0, n - 60)], [n, n + 30]],
      lte: [[n, Math.max(0, n - 60)], [n + 1, n + 30]],
    };
    const f = flips[op];
    if (!f) return [];
    return (want ? f[0] : f[1]).map(mk);
  }

  switch (op) {
    case "gt": case "gte": case "lt": case "lte": {
      if (typeof value !== "number") return [];
      const d = delta(field, value);
      const up = [round(value + d), round(value * 1.5 + d)];
      const down = [round(value - d), round(Math.max(d, value * 0.5))];
      let t: number[], f: number[];
      if (op === "gt") { t = up; f = [value, down[1]]; }
      else if (op === "gte") { t = [value, up[1]]; f = down; }
      else if (op === "lt") { t = down; f = [value, up[1]]; }
      else { t = [value, down[1]]; f = up; }
      return (want ? t : f).filter((x) => x >= 0).map((x) => ({ [field]: x }));
    }
    case "eq": case "neq": {
      const positive = (op === "eq") === want;
      if (positive) return [{ [field]: value }];
      const alts = (ALT_VALUES[field] ?? [`${String(value)}_other`]).filter((a) => norm(a) !== norm(value));
      return alts.slice(0, 2).map((a) => ({ [field]: a }));
    }
    case "in": case "not_in": {
      const list = Array.isArray(value) ? value : String(value).split(",").map((s) => s.trim());
      const positive = (op === "in") === want;
      if (positive) return list.slice(0, 2).map((v) => ({ [field]: v }));
      const alts = (ALT_VALUES[field] ?? ["OTHER"]).filter((a) => !list.some((l) => norm(l) === norm(a)));
      return alts.slice(0, 2).map((a) => ({ [field]: a }));
    }
    case "matches": {
      if (typeof value !== "string") return [];
      if (want) {
        const samples = expandRegex(value).filter((s) => /[a-z]/i.test(s));
        const out: Assign[] = [];
        for (const s of samples) {
          const narrative = `${cap(s)} regarding the Acme supply agreement dispute`;
          if (regexOk(value, narrative)) out.push({ [field]: field === "narrative" ? narrative : s });
          if (out.length >= 2) break;
        }
        return out;
      }
      return NEUTRAL_NARRATIVES.filter((n) => !regexOk(value, n)).slice(0, 2).map((n) => ({ [field]: n }));
    }
    case "contains_any": {
      const phrases = (Array.isArray(value) ? value : [value]).map(String).filter(Boolean);
      if (want) {
        return phrases.slice(0, 2).map((p) => ({ [field]: `${cap(p)} pricing litigation matter for Acme` }));
      }
      return NEUTRAL_NARRATIVES.filter((n) => !phrases.some((p) => norm(n).includes(norm(p))))
        .slice(0, 2)
        .map((n) => ({ [field]: n }));
    }
    case "word_count_lt": {
      const n = Number(value);
      if (!Number.isFinite(n)) return [];
      const words = (k: number) => {
        const w: string[] = [];
        for (let j = 0; j < k; j++) w.push(WORDS[j % WORDS.length]);
        return w.join(" ");
      };
      if (want) return [n - 1, Math.max(1, n - 2)].filter((k) => k >= 1).map((k) => ({ [field]: words(k) }));
      return [n, n + 3].map((k) => ({ [field]: words(Math.max(1, k)) }));
    }
    case "segment_count_gt": {
      const n = Number(value);
      if (!Number.isFinite(n)) return [];
      const join = (k: number) => TASKS.slice(0, Math.max(1, k)).join("; ");
      if (want) return [{ [field]: join(n + 1) }, { [field]: join(n + 2) }];
      if (n < 1) return [];
      return [{ [field]: n === 1 ? "Drafted motion to compel production of custodial emails" : join(n) }];
    }
    case "not_multiple_of": {
      const m = Number(value);
      if (!Number.isFinite(m) || m <= 0) return [];
      if (want) return [{ [field]: round(12 * m + m / 2, 4) }, { [field]: round(7 * m + m / 2, 4) }];
      return [{ [field]: round(12 * m, 4) }, { [field]: round(20 * m, 4) }];
    }
    case "gt_field": case "lt_field": {
      if (typeof value !== "string") return [];
      const other = value;
      const otherVal = Number(base[other]);
      const d = Number.isFinite(otherVal) && otherVal >= 1000 ? 500 : 1;
      const positive = want;
      const sign = op === "gt_field" ? 1 : -1;
      const mk = (k: number): Assign => ({ [field]: ((r: Rec) => round(Number(r[other]) + k)) as Lazy });
      return positive ? [mk(sign * d), mk(sign * d * 10)] : [mk(0), mk(-sign * d)];
    }
    case "not_in_field": {
      if (typeof value !== "string") return [];
      const other = value;
      const listOf = (r: Rec) => (Array.isArray(r[other]) ? (r[other] as unknown[]) : String(r[other] ?? "").split(","));
      if (want) {
        const pick = (nth: number) => ((r: Rec) =>
          [...(ALT_VALUES[field] ?? []), "ZZZ-1", "ZZZ-2"].filter((a) => !listOf(r).some((l) => norm(l) === norm(a)))[nth]) as Lazy;
        return [{ [field]: pick(0) }, { [field]: pick(1) }];
      }
      return [
        { [field]: ((r: Rec) => listOf(r)[0]) as Lazy },
        { [field]: ((r: Rec) => listOf(r)[listOf(r).length - 1]) as Lazy },
      ];
    }
    default:
      return [];
  }
}

/* ───────── condition → assignment variants ───────── */

function merge(a: Assign, b: Assign): Assign | null {
  const out: Assign = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (k in out) {
      const x = out[k];
      if (typeof x === "function" || typeof v === "function") return null;
      if (JSON.stringify(x) !== JSON.stringify(v)) return null;
    }
    out[k] = v;
  }
  return out;
}

function mergeAll(list: Assign[]): Assign | null {
  let acc: Assign | null = {};
  for (const a of list) {
    acc = acc && merge(acc, a);
    if (!acc) return null;
  }
  return acc;
}

function resolveConflict(c: Condition, want: boolean, rt: RecordType, vs: Assign[][]): Assign[] {
  const pool: Record<string, unknown[]> = {};
  for (const v of vs) for (const a of v) for (const [k, x] of Object.entries(a)) {
    if (typeof x === "function") continue;
    (pool[k] ??= []).push(x);
  }
  if (pool.narrative) pool.narrative.push(...NEUTRAL_NARRATIVES);
  const keys = Object.keys(pool);
  // greedy: for each key try candidates until the whole condition evaluates to `want`
  const assign: Assign = {};
  for (const k of keys) assign[k] = pool[k][0];
  const ok = () => {
    try {
      return evalCondition(c, build(rt, assign)) === want;
    } catch {
      return false;
    }
  };
  const found: Assign[] = [];
  const seen = new Set<string>();
  const take = () => {
    const key = JSON.stringify(assign);
    if (!seen.has(key) && ok()) {
      seen.add(key);
      found.push({ ...assign });
    }
  };
  take();
  for (const k of keys) {
    for (const cand of pool[k]) {
      if (found.length >= 3) break;
      assign[k] = cand;
      take();
    }
    if (found.length) assign[k] = found[0][k];
  }
  return found;
}

function sat(c: Condition, want: boolean, rt: RecordType): Assign[] {
  if ("all" in c || "any" in c) {
    const kids = "all" in c ? c.all : c.any;
    const conj = ("all" in c) === want; // all children must be `want`
    if (conj) {
      const vs = kids.map((k) => sat(k, want, rt));
      if (vs.some((v) => v.length === 0)) return [];
      const out: Assign[] = [];
      const first = mergeAll(vs.map((v) => v[0]));
      if (first) out.push(first);
      else {
        // conflicting requirements on the same field: search candidate values validated by the engine
        out.push(...resolveConflict(c, want, rt, vs));
      }
      vs.forEach((v, i) => {
        for (const alt of v.slice(1)) {
          const m = mergeAll(vs.map((w, j) => (j === i ? alt : w[0])));
          if (m) out.push(m);
        }
      });
      return out;
    }
    // exactly one child `want`, the rest the opposite (near-miss style)
    const out: Assign[] = [];
    kids.forEach((k, i) => {
      for (const v of sat(k, want, rt).slice(0, 2)) {
        const others = kids.filter((_, j) => j !== i).map((o) => sat(o, !want, rt)[0]);
        const m = others.every(Boolean) ? mergeAll([v, ...(others as Assign[])]) : null;
        out.push(m ?? v);
      }
    });
    return out;
  }
  if ("not" in c) return sat(c.not, !want, rt);
  return leafVariants(c.field, c.op, c.value, want, rt);
}

function build(rt: RecordType, assign: Assign, extra: Rec = {}): Rec {
  const base = rt === "h1b_petition" ? H1B_BASE : TE_BASE;
  const r: Rec = { ...base, ...extra };
  if (Array.isArray(base.lcaWorksiteZips)) r.lcaWorksiteZips = [...(base.lcaWorksiteZips as string[])];
  const lazies: Array<[string, Lazy]> = [];
  for (const [k, v] of Object.entries(assign)) {
    if (typeof v === "function") lazies.push([k, v as Lazy]);
    else r[k] = v;
  }
  for (const [k, f] of lazies) r[k] = f(r);
  if (rt === "time_entry" && !("amount" in assign)) r.amount = round(Number(r.hours) * Number(r.rate));
  return r;
}

function describe(a: Assign, r?: Rec): string {
  return Object.entries(a)
    .map(([k, v]) => `${k}=${JSON.stringify(typeof v === "function" ? r?.[k] : v)}`)
    .join(", ")
    .slice(0, 110);
}

/* ───────── entry rules ───────── */

function entryTests(rule: Rule, rt: RecordType): RuleTest[] {
  const v = rule.violation as Condition;
  const combined: Condition = rule.when ? { all: [rule.when, v] } : v;
  const tests: RuleTest[] = [];
  let n = 0;
  for (const a of sat(combined, true, rt).slice(0, 4)) {
    const r = build(rt, a);
    tests.push({ name: `flags: ${describe(a, r)}`, expectFlagged: true, records: [{ id: `g${++n}`, ...r }] });
  }
  for (const a of sat(combined, false, rt).slice(0, 5)) {
    const r = build(rt, a);
    tests.push({ name: `passes (near miss): ${describe(a, r)}`, expectFlagged: false, records: [{ id: `g${++n}`, ...r }] });
  }
  return tests;
}

/* ───────── group rules ───────── */

function groupTests(rule: Rule, agg: Aggregate, rt: RecordType): RuleTest[] {
  if (agg.op !== "gt" && agg.op !== "gte") return [];
  const whenT: Assign = rule.when ? sat(rule.when, true, rt)[0] ?? {} : {};
  const whenF: Assign | null = rule.when ? sat(rule.when, false, rt)[0] ?? null : null;
  if (rule.when && !sat(rule.when, true, rt).length) return [];
  const byDate = agg.groupBy.includes("date" as Field);
  const byTk = agg.groupBy.includes("timekeeperId" as Field);
  const tests: RuleTest[] = [];
  let id = 0;
  const rec = (tkIdx: number, assign: Assign, extra: Rec = {}) => {
    const tk = timekeeper(tkIdx);
    return { id: `g${++id}`, ...build(rt, assign, { ...tk, ...extra }) };
  };

  if (agg.fn === "count_distinct" || agg.fn === "count") {
    const T = agg.op === "gt" ? Math.floor(agg.value) + 1 : Math.ceil(agg.value); // smallest flagging size
    const distinctTk = agg.field === "timekeeperId";
    const group = (k: number, opts: { splitDate?: boolean; oneOff?: boolean } = {}) =>
      Array.from({ length: k }, (_, i) => {
        const offWhen = opts.oneOff && i === k - 1 && whenF;
        const a = offWhen ? whenF! : whenT;
        const extra: Rec = { date: opts.splitDate && i === k - 1 ? "2026-10-07" : "2026-10-06" };
        if (!distinctTk && agg.fn === "count_distinct") extra[agg.field] = `${agg.field}_${i}`;
        return rec(distinctTk || agg.fn === "count_distinct" ? i : 1, a, extra);
      });
    tests.push({ name: `flags: ${T} ${distinctTk ? "distinct timekeepers" : "records"} in the same group`, expectFlagged: true, records: group(T) });
    tests.push({ name: `flags: ${T + 1} ${distinctTk ? "distinct timekeepers" : "records"} in the same group`, expectFlagged: true, records: group(T + 1) });
    if (T - 1 >= 1) tests.push({ name: `passes (boundary): exactly ${T - 1} in the same group`, expectFlagged: false, records: group(T - 1) });
    if (byDate) tests.push({ name: `passes: ${T} spread across two days`, expectFlagged: false, records: group(T, { splitDate: true }) });
    if (whenF) tests.push({ name: `passes: ${T} records but one is outside the rule's scope`, expectFlagged: false, records: group(T, { oneOff: true }) });
    return tests;
  }

  if (agg.fn === "sum") {
    const N = agg.value;
    const d = agg.field === "hours" ? 0.1 : 1;
    const over = round(agg.op === "gt" ? N + d : N);
    const under = round(agg.op === "gt" ? N : N - d);
    const split = (total: number) => {
      const a = round(Math.ceil((total / 2) * 10) / 10, 1);
      return [a, round(total - a, 1)];
    };
    const pair = (total: number, opts: { otherDay?: boolean; otherTk?: boolean; oneOff?: boolean } = {}) =>
      split(total).map((h, i) =>
        rec(
          opts.otherTk && i === 1 ? 0 : 1,
          opts.oneOff && i === 1 && whenF ? whenF : whenT,
          { [agg.field]: h, date: opts.otherDay && i === 1 ? "2026-10-07" : "2026-10-06" },
        ),
      );
    tests.push({ name: `flags: two entries totalling ${over} ${agg.field} in one group`, expectFlagged: true, records: pair(over) });
    tests.push({ name: `flags: two entries totalling ${round(N + 2)} ${agg.field} in one group`, expectFlagged: true, records: pair(round(N + 2)) });
    tests.push({ name: `passes (boundary): two entries totalling exactly ${under}`, expectFlagged: false, records: pair(under) });
    if (byDate) tests.push({ name: `passes: ${round(N + 2)} split across two days`, expectFlagged: false, records: pair(round(N + 2), { otherDay: true }) });
    if (byTk) tests.push({ name: `passes: ${round(N + 2)} split across two timekeepers`, expectFlagged: false, records: pair(round(N + 2), { otherTk: true }) });
    if (whenF) tests.push({ name: `passes: over the cap only when out-of-scope work is counted`, expectFlagged: false, records: pair(round(N + 2), { oneOff: true }) });
    return tests;
  }
  return [];
}

const VARIATIONS: Array<{ label: string; set: Rec }> = [
  { label: "partner, longer entry", set: { timekeeperId: "tk_hale", timekeeperName: "Margaret Hale", role: "partner", rate: 950, hours: 2.4, date: "2026-10-14", narrative: "Reviewed expert report from defense damages consultant" } },
  { label: "paralegal, short entry", set: { timekeeperId: "tk_nair", timekeeperName: "Priya Nair", role: "paralegal", rate: 280, hours: 0.7, date: "2026-10-21", offeredWage: 131000, worksiteZip: "94107", filingDate: "2026-05-01" } },
];

/* ───────── public API ───────── */

export function generateTests(rule: Rule, recordType: RecordType): RuleTest[] {
  let candidates: RuleTest[] = [];
  try {
    candidates = isAggregate(rule.violation) ? groupTests(rule, rule.violation, recordType) : entryTests(rule, recordType);
  } catch {
    candidates = [];
  }
  // de-duplicate identical record sets
  const seen = new Set<string>();
  candidates = candidates.filter((t) => {
    const key = JSON.stringify([t.expectFlagged, t.records.map((r) => ({ ...r, id: undefined }))]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Validate against the real engine; keep only tests whose outcome matches the intent.
  const validate = (ts: RuleTest[]) => {
    const res = runTests(rule, ts);
    return ts.filter((_, i) => res[i]?.passed);
  };
  let kept = validate(candidates);
  // Top up a thin side with realistic variants of an existing test (different timekeeper / hours / day),
  // still validated by the engine.
  for (const want of [true, false]) {
    const side = kept.filter((t) => t.expectFlagged === want);
    if (side.length >= 2 || !side.length || isAggregate(rule.violation)) continue;
    const src = side[0];
    const variants: RuleTest[] = VARIATIONS.map((v, i) => ({
      name: `${src.name} (variant: ${v.label})`,
      expectFlagged: want,
      records: src.records.map((r) => {
        const out: Rec = { ...r, id: `v${i}` };
        for (const [k, val] of Object.entries(v.set)) {
          if (k in rule.violation || JSON.stringify(rule).includes(`"${k}"`)) continue; // never touch fields the rule reads
          out[k] = val;
        }
        if (recordType === "time_entry") out.amount = round(Number(out.hours) * Number(out.rate));
        return out;
      }),
    })).filter((t) => JSON.stringify(t.records) !== JSON.stringify(src.records.map((r) => ({ ...r, id: (t.records[0] as Rec).id }))));
    kept = [...kept, ...validate(variants).slice(0, 2 - side.length)];
  }
  const pos = kept.filter((t) => t.expectFlagged).slice(0, 3);
  const neg = kept.filter((t) => !t.expectFlagged).slice(0, 3);
  return [...pos, ...neg];
}
