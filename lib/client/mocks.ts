/**
 * Lexer — synthetic frontend fixtures (F2).
 * All data is fictional. Types come only from the shared contract.
 */
import {
  DEMO,
  type AuditEntry,
  type Clause,
  type ClauseKind,
  type CompileEvent,
  type CompiledRule,
  type DashboardSummary,
  type EvalResult,
  type Flag,
  type Invoice,
  type InvoiceCheckResult,
  type InvoiceSummary,
  type InvoiceTotals,
  type ReviewItem,
  type Role,
  type Rule,
  type RuleStatus,
  type RuleTest,
  type Rulebook,
  type RulebookSummary,
  type Suggestion,
  type TestResult,
  type TimeEntry,
} from "@/shared/contract";

/* ───────────────────────────── helpers ───────────────────────────── */

const round2 = (n: number): number => Math.round(n * 100) / 100;

interface ClauseSpec {
  id: string;
  number: string;
  title: string;
  body: string;
  kind: ClauseKind;
  kindReason: string;
}

/** Builds sourceText + clauses with exact char offsets (computed, never hand-counted). */
function buildDocument(
  rulebookId: string,
  header: string,
  specs: ClauseSpec[],
  footer: string,
): { sourceText: string; clauses: Clause[] } {
  const paragraphs = specs.map((s) => `${s.number} ${s.title}. ${s.body}`);
  const sourceText = `${header}\n\n${paragraphs.join("\n\n")}\n\n${footer}\n`;
  let cursor = 0;
  const clauses: Clause[] = specs.map((s, i) => {
    const text = paragraphs[i];
    const start = sourceText.indexOf(text, cursor);
    if (start < 0) throw new Error(`mock clause ${s.number} not found in sourceText`);
    const end = start + text.length;
    cursor = end;
    return {
      id: s.id,
      rulebookId,
      number: s.number,
      title: s.title,
      text,
      start,
      end,
      kind: s.kind,
      kindReason: s.kindReason,
    };
  });
  return { sourceText, clauses };
}

function passResults(tests: RuleTest[]): TestResult[] {
  return tests.map((t) => ({
    name: t.name,
    expectFlagged: t.expectFlagged,
    actualFlagged: t.expectFlagged,
    passed: true,
  }));
}

function compiled(
  id: string,
  clauseId: string,
  dsl: Rule,
  tests: RuleTest[],
  attempts = 1,
): CompiledRule {
  return { id, clauseId, status: "verified", attempts, dsl, tests, testResults: passResults(tests) };
}

/* ───────────────────────────── Acme OCG rulebook ───────────────────────────── */

const ACME_HEADER = [
  "ACME CORP",
  "OUTSIDE COUNSEL GUIDELINES — BILLING REQUIREMENTS",
  "Effective January 1, 2026",
  "",
  "These Guidelines govern all invoices submitted by outside counsel to Acme Corp (\"Acme\"). Time entries that do not comply with this Section 3 may be reduced or rejected by Acme in its sole discretion.",
  "",
  "SECTION 3. TIME ENTRIES AND BILLABLE WORK",
].join("\n");

const ACME_FOOTER =
  "Acme reserves the right to audit any invoice. Questions regarding these Guidelines should be directed to the Acme Legal Operations team.";

const ACME_SPECS: ClauseSpec[] = [
  {
    id: "cl_3_1",
    number: "3.1",
    title: "Block Billing",
    body: "Each time entry must describe a single task. Entries that combine multiple discrete tasks under a single time charge (\"block billing\") and exceed 0.5 hours will be rejected in full.",
    kind: "compilable",
    kindReason: "Objective test: count of distinct tasks in the narrative and an hours threshold.",
  },
  {
    id: "cl_3_2",
    number: "3.2",
    title: "Vague Narratives",
    body: "Narratives must state the specific task performed and its subject matter. Entries with fewer than five words, or that rely on non-descriptive phrases such as \"attention to\", \"work on file\", or \"review documents\" without identifying the subject, will be rejected.",
    kind: "compilable",
    kindReason: "Objective test: word count plus a closed list of prohibited phrases.",
  },
  {
    id: "cl_3_3",
    number: "3.3",
    title: "Staffing",
    body: "No more than two (2) timekeepers may bill for attendance at the same deposition, hearing, or meeting. Time billed by any additional attendee will be rejected.",
    kind: "compilable",
    kindReason: "Objective test: distinct timekeepers per date and task, threshold of two.",
  },
  {
    id: "cl_3_4",
    number: "3.4",
    title: "Travel",
    body: "Non-working travel time shall be billed at fifty percent (50%) of the timekeeper's standard hourly rate. Time spent performing substantive work while traveling may be billed at the full rate.",
    kind: "compilable",
    kindReason: "Objective test: travel narratives receive a fixed 0.5 rate adjustment.",
  },
  {
    id: "cl_3_5",
    number: "3.5",
    title: "Clerical Work",
    body: "Clerical and administrative tasks, including filing, copying, scheduling, and document organization or indexing, are part of firm overhead and are not billable, regardless of the timekeeper performing them.",
    kind: "compilable",
    kindReason: "Objective test: narrative describes an enumerated clerical task.",
  },
  {
    id: "cl_3_6",
    number: "3.6",
    title: "Daily Cap",
    body: "No timekeeper may bill more than ten (10) hours in a single day on any one Acme matter. Hours in excess of the daily cap will not be paid.",
    kind: "compilable",
    kindReason: "Objective test: sum of hours per timekeeper per day, threshold of ten.",
  },
  {
    id: "cl_3_7",
    number: "3.7",
    title: "Reasonableness",
    body: "All time billed must be reasonable and necessary to the matter. Acme may reduce any charge it determines, in its judgment, to be excessive in light of the task performed.",
    kind: "judgment",
    kindReason: "Requires professional judgment about what is \"reasonable and necessary\"; no objective threshold. Routed to attorney review, never auto-enforced.",
  },
];

const acmeDoc = buildDocument(DEMO.rulebookId, ACME_HEADER, ACME_SPECS, ACME_FOOTER);

const r = (n: string): string => `rule_${n.replace(".", "_")}`;
const c = (n: string): string => `cl_${n.replace(".", "_")}`;

const RULE_3_1: Rule = {
  id: r("3.1"),
  clauseId: c("3.1"),
  title: "Block billing over 0.5 hrs",
  severity: "reject",
  scope: "entry",
  recordType: "time_entry",
  when: { field: "hours", op: "gt", value: 0.5 },
  violation: { field: "narrative", op: "segment_count_gt", value: 1 },
  message: "Entry combines multiple tasks in one time charge and exceeds 0.5 hours (OCG §3.1).",
};
const TESTS_3_1: RuleTest[] = [
  { name: "Three tasks, 3.4 hrs → flagged", records: [{ hours: 3.4, narrative: "Reviewed production; drafted motion to compel; call with client" }], expectFlagged: true },
  { name: "Single task, 2.0 hrs → clean", records: [{ hours: 2.0, narrative: "Drafted motion to compel discovery responses" }], expectFlagged: false },
  { name: "Two tasks joined by 'and', 1.2 hrs → flagged", records: [{ hours: 1.2, narrative: "Reviewed answer and drafted discovery plan" }], expectFlagged: true },
  { name: "Two tasks but only 0.4 hrs → clean", records: [{ hours: 0.4, narrative: "Emailed client; updated calendar" }], expectFlagged: false },
];

const RULE_3_2: Rule = {
  id: r("3.2"),
  clauseId: c("3.2"),
  title: "Vague narrative",
  severity: "reject",
  scope: "entry",
  recordType: "time_entry",
  violation: {
    any: [
      { field: "narrative", op: "word_count_lt", value: 5 },
      { field: "narrative", op: "contains_any", value: ["attention to", "work on file", "review documents"] },
    ],
  },
  message: "Narrative is too vague to identify the task and its subject (OCG §3.2).",
};
const TESTS_3_2: RuleTest[] = [
  { name: "'Attention to file' → flagged", records: [{ narrative: "Attention to file" }], expectFlagged: true },
  { name: "Specific 9-word narrative → clean", records: [{ narrative: "Drafted first set of requests for production to Brightline" }], expectFlagged: false },
  { name: "'Review documents' boilerplate → flagged", records: [{ narrative: "Review documents for upcoming case matters" }], expectFlagged: true },
  { name: "Four-word narrative → flagged", records: [{ narrative: "Call with client team" }], expectFlagged: true },
];

const RULE_3_3: Rule = {
  id: r("3.3"),
  clauseId: c("3.3"),
  title: "More than 2 attendees",
  severity: "reject",
  scope: "group",
  recordType: "time_entry",
  when: { field: "activityCode", op: "eq", value: "A109" },
  violation: { groupBy: ["date", "taskCode"], fn: "count_distinct", field: "timekeeperId", op: "gt", value: 2 },
  message: "More than two timekeepers billed to attend the same deposition, hearing, or meeting (OCG §3.3).",
};
const att = (tk: string, date = "2026-10-09") => ({ date, taskCode: "L330", activityCode: "A109", timekeeperId: tk, hours: 3 });
const TESTS_3_3: RuleTest[] = [
  { name: "Three attendees at one deposition → flagged", records: [att("tk_a"), att("tk_b"), att("tk_c")], expectFlagged: true },
  { name: "Two attendees → clean", records: [att("tk_a"), att("tk_b")], expectFlagged: false },
  { name: "Three attendees on different days → clean", records: [att("tk_a", "2026-10-09"), att("tk_b", "2026-10-10"), att("tk_c", "2026-10-11")], expectFlagged: false },
  { name: "Same timekeeper twice + one other → clean", records: [att("tk_a"), att("tk_a"), att("tk_b")], expectFlagged: false },
];

const RULE_3_4: Rule = {
  id: r("3.4"),
  clauseId: c("3.4"),
  title: "Non-working travel at 50%",
  severity: "reduce",
  scope: "entry",
  recordType: "time_entry",
  violation: {
    all: [
      { field: "narrative", op: "matches", value: "\\btravel" },
      { not: { field: "narrative", op: "matches", value: "\\b(prepar|draft|review|research)" } },
    ],
  },
  adjustment: { type: "rate_factor", factor: 0.5 },
  message: "Non-working travel must be billed at 50% of the standard rate (OCG §3.4).",
};
const TESTS_3_4: RuleTest[] = [
  { name: "Non-working travel → flagged", records: [{ narrative: "Non-working travel from New York to Chicago" }], expectFlagged: true },
  { name: "Deposition prep (no travel) → clean", records: [{ narrative: "Prepared deposition outline for witness" }], expectFlagged: false },
  { name: "Travel while drafting → clean", records: [{ narrative: "Travel to Chicago while drafting cross outline" }], expectFlagged: false },
  { name: "Return travel → flagged", records: [{ narrative: "Return travel to New York after hearing" }], expectFlagged: true },
];

const RULE_3_5: Rule = {
  id: r("3.5"),
  clauseId: c("3.5"),
  title: "Clerical work not billable",
  severity: "reject",
  scope: "entry",
  recordType: "time_entry",
  violation: {
    field: "narrative",
    op: "matches",
    value: "\\b(fil(e|ed|ing) (with|at) the court|copy|copying|copied|schedul\\w*|organiz\\w*|index\\w*)\\b",
  },
  message: "Clerical or administrative task is firm overhead and not billable (OCG §3.5).",
};
const TESTS_3_5: RuleTest[] = [
  { name: "Organizing binders → flagged", records: [{ narrative: "Organized and indexed correspondence binders" }], expectFlagged: true },
  { name: "Scheduling conference room → flagged", records: [{ narrative: "Scheduled conference room for deposition" }], expectFlagged: true },
  { name: "Privilege log (substantive) → clean", records: [{ narrative: "Prepared privilege log entries for production" }], expectFlagged: false },
  { name: "Legal research → clean", records: [{ narrative: "Researched spoliation sanctions case law" }], expectFlagged: false },
];

const RULE_3_6: Rule = {
  id: r("3.6"),
  clauseId: c("3.6"),
  title: "Daily cap of 10 hrs",
  severity: "reject",
  scope: "group",
  recordType: "time_entry",
  violation: { groupBy: ["date", "timekeeperId"], fn: "sum", field: "hours", op: "gt", value: 10 },
  message: "Timekeeper billed more than 10 hours in a single day on this matter (OCG §3.6).",
};
const day = (tk: string, hours: number, date = "2026-10-14") => ({ date, timekeeperId: tk, hours });
const TESTS_3_6: RuleTest[] = [
  { name: "11.0 hrs in one day → flagged", records: [day("tk_a", 6), day("tk_a", 3.5), day("tk_a", 1.5)], expectFlagged: true },
  { name: "Exactly 10.0 hrs → clean", records: [day("tk_a", 6), day("tk_a", 4)], expectFlagged: false },
  { name: "Two timekeepers, 8 hrs each → clean", records: [day("tk_a", 8), day("tk_b", 8)], expectFlagged: false },
  { name: "12 hrs split across two days → clean", records: [day("tk_a", 6, "2026-10-14"), day("tk_a", 6, "2026-10-15")], expectFlagged: false },
];

/** First (failing) attempt for 3.2, used by the compile stream's repair beat. */
export const MOCK_3_2_FIRST_ATTEMPT_RESULTS: TestResult[] = TESTS_3_2.map((t, i) => ({
  name: t.name,
  expectFlagged: t.expectFlagged,
  actualFlagged: i === 2 ? false : t.expectFlagged,
  passed: i !== 2,
}));

const ACME_RULES: CompiledRule[] = [
  compiled(r("3.1"), c("3.1"), RULE_3_1, TESTS_3_1),
  compiled(r("3.2"), c("3.2"), RULE_3_2, TESTS_3_2, 2),
  compiled(r("3.3"), c("3.3"), RULE_3_3, TESTS_3_3),
  compiled(r("3.4"), c("3.4"), RULE_3_4, TESTS_3_4),
  compiled(r("3.5"), c("3.5"), RULE_3_5, TESTS_3_5),
  compiled(r("3.6"), c("3.6"), RULE_3_6, TESTS_3_6),
  { id: r("3.7"), clauseId: c("3.7"), status: "needs_interpretation", attempts: 0, dsl: null, tests: [], testResults: [] },
];

export const MOCK_RULEBOOK: Rulebook = {
  id: DEMO.rulebookId,
  clientId: DEMO.clientId,
  clientName: DEMO.clientName,
  title: "Acme Corp Outside Counsel Guidelines (2026)",
  recordType: "time_entry",
  sourceText: acmeDoc.sourceText,
  clauses: acmeDoc.clauses,
  rules: ACME_RULES,
  createdAt: "2026-10-12T15:04:00.000Z",
};

/* ───────────────────────────── USCIS H-1B rulebook (P1) ───────────────────────────── */

const USCIS_SPECS: ClauseSpec[] = [
  {
    id: "cl_h1b_1",
    number: "1",
    title: "Prevailing Wage",
    body: "The wage offered to the beneficiary must be equal to or greater than the prevailing wage stated on the certified Labor Condition Application (LCA).",
    kind: "compilable",
    kindReason: "Objective numeric comparison between two petition fields.",
  },
  {
    id: "cl_h1b_2",
    number: "2",
    title: "Worksite Location",
    body: "The beneficiary's intended worksite ZIP code must be listed among the worksite locations on the certified LCA.",
    kind: "compilable",
    kindReason: "Objective set-membership check against the LCA worksite list.",
  },
  {
    id: "cl_h1b_3",
    number: "3",
    title: "Filing Window",
    body: "The petition may be filed no more than six (6) months before the requested employment start date.",
    kind: "compilable",
    kindReason: "Objective date arithmetic: days before start must not exceed 183.",
  },
];

const uscisDoc = buildDocument(
  DEMO.uscisRulebookId,
  "H-1B PETITION PRE-FILING CHECKLIST (SYNTHETIC)\n\nBefore filing Form I-129, counsel must confirm each of the following:",
  USCIS_SPECS,
  "This checklist is a synthetic demonstration and is not legal advice.",
);

const pet = (o: Record<string, unknown>): Record<string, unknown> => ({
  offeredWage: 120000,
  lcaPrevailingWage: 110000,
  worksiteZip: "94105",
  lcaWorksiteZips: ["94105", "94107"],
  daysBeforeStart: 150,
  ...o,
});

const H1B_RULES: { rule: Rule; tests: RuleTest[] }[] = [
  {
    rule: {
      id: "rule_h1b_1", clauseId: "cl_h1b_1", title: "Offered wage ≥ prevailing wage", severity: "reject", scope: "entry", recordType: "h1b_petition",
      violation: { field: "offeredWage", op: "lt_field", value: "lcaPrevailingWage" },
      message: "Offered wage is below the LCA prevailing wage.",
    },
    tests: [
      { name: "Wage below prevailing → flagged", records: [pet({ offeredWage: 98000 })], expectFlagged: true },
      { name: "Wage above prevailing → clean", records: [pet({})], expectFlagged: false },
      { name: "Wage equal to prevailing → clean", records: [pet({ offeredWage: 110000 })], expectFlagged: false },
      { name: "Wage $1 below → flagged", records: [pet({ offeredWage: 109999 })], expectFlagged: true },
    ],
  },
  {
    rule: {
      id: "rule_h1b_2", clauseId: "cl_h1b_2", title: "Worksite ZIP on LCA", severity: "reject", scope: "entry", recordType: "h1b_petition",
      violation: { field: "worksiteZip", op: "not_in_field", value: "lcaWorksiteZips" },
      message: "Worksite ZIP code is not listed on the certified LCA.",
    },
    tests: [
      { name: "ZIP listed → clean", records: [pet({})], expectFlagged: false },
      { name: "ZIP not listed → flagged", records: [pet({ worksiteZip: "10001" })], expectFlagged: true },
      { name: "Second listed ZIP → clean", records: [pet({ worksiteZip: "94107" })], expectFlagged: false },
      { name: "Empty LCA list → flagged", records: [pet({ lcaWorksiteZips: [] })], expectFlagged: true },
    ],
  },
  {
    rule: {
      id: "rule_h1b_3", clauseId: "cl_h1b_3", title: "Filed ≤ 6 months before start", severity: "reject", scope: "entry", recordType: "h1b_petition",
      violation: { field: "daysBeforeStart", op: "gt", value: 183 },
      message: "Petition filed more than six months before the requested start date.",
    },
    tests: [
      { name: "150 days before start → clean", records: [pet({})], expectFlagged: false },
      { name: "200 days before start → flagged", records: [pet({ daysBeforeStart: 200 })], expectFlagged: true },
      { name: "Exactly 183 days → clean", records: [pet({ daysBeforeStart: 183 })], expectFlagged: false },
      { name: "184 days → flagged", records: [pet({ daysBeforeStart: 184 })], expectFlagged: true },
    ],
  },
];

export const MOCK_USCIS_RULEBOOK: Rulebook = {
  id: DEMO.uscisRulebookId,
  clientId: DEMO.clientId,
  clientName: "Acme Corp (Immigration)",
  title: "USCIS H-1B Pre-Filing Checklist",
  recordType: "h1b_petition",
  sourceText: uscisDoc.sourceText,
  clauses: uscisDoc.clauses,
  rules: H1B_RULES.map(({ rule, tests }) => compiled(rule.id, rule.clauseId, rule, tests)),
  createdAt: "2026-10-12T16:20:00.000Z",
};

export function summarizeRulebook(rb: Rulebook): RulebookSummary {
  const statusCounts: Partial<Record<RuleStatus, number>> = {};
  for (const rule of rb.rules) statusCounts[rule.status] = (statusCounts[rule.status] ?? 0) + 1;
  return {
    id: rb.id,
    title: rb.title,
    clientName: rb.clientName,
    recordType: rb.recordType,
    clauseCount: rb.clauses.length,
    statusCounts,
  };
}

export const MOCK_RULEBOOK_SUMMARIES: RulebookSummary[] = [
  summarizeRulebook(MOCK_RULEBOOK),
  summarizeRulebook(MOCK_USCIS_RULEBOOK),
];

/* ───────────────────────────── Invoice (20 entries) ───────────────────────────── */

const TK: Record<string, { name: string; role: Role; rate: number }> = {
  tk_chen: { name: "Margaret Chen", role: "partner", rate: 650 },
  tk_park: { name: "David Park", role: "associate", rate: 425 },
  tk_okafor: { name: "Sarah Okafor", role: "associate", rate: 425 },
  tk_moreno: { name: "Luis Moreno", role: "paralegal", rate: 195 },
};

type Row = [date: string, tk: string, hours: number, task: string, activity: string, narrative: string];

const ROWS: Row[] = [
  ["2026-10-01", "tk_chen", 1.2, "L110", "A106", "Conference with Acme general counsel regarding litigation strategy for Brightline dispute"],
  ["2026-10-01", "tk_park", 2.5, "L120", "A104", "Analyzed plaintiff's complaint for potential defenses under Delaware contract law"],
  ["2026-10-02", "tk_park", 3.4, "L310", "A104", "Reviewed production documents; drafted motion to compel; call with client re discovery schedule"],
  ["2026-10-03", "tk_chen", 0.8, "L120", "A104", "Attention to file"],
  ["2026-10-05", "tk_okafor", 2.0, "L310", "A103", "Drafted first set of requests for production directed to Brightline Logistics"],
  ["2026-10-06", "tk_moreno", 1.5, "L140", "A110", "Organized and indexed correspondence binders; scheduled conference room"],
  ["2026-10-07", "tk_okafor", 3.2, "L330", "A101", "Prepared deposition outline for deposition of J. Whitfield"],
  ["2026-10-08", "tk_chen", 2.0, "L330", "A111", "Non-working travel from New York to Chicago for Whitfield deposition"],
  ["2026-10-09", "tk_chen", 4.0, "L330", "A109", "Attended and defended deposition of J. Whitfield"],
  ["2026-10-09", "tk_park", 4.0, "L330", "A109", "Attended deposition of J. Whitfield as second chair"],
  ["2026-10-09", "tk_moreno", 3.0, "L330", "A109", "Attended deposition of J. Whitfield to manage exhibits"],
  ["2026-10-10", "tk_chen", 1.8, "L330", "A111", "Travel to deposition and prepared outline for cross-examination"],
  ["2026-10-12", "tk_okafor", 2.4, "L320", "A102", "Researched Seventh Circuit case law on spoliation sanctions"],
  ["2026-10-14", "tk_okafor", 6.0, "L250", "A103", "Drafted opposition to Brightline's motion for summary judgment"],
  ["2026-10-14", "tk_okafor", 3.5, "L250", "A102", "Researched authority on contract ambiguity for summary judgment opposition"],
  ["2026-10-14", "tk_okafor", 1.5, "L250", "A103", "Revised statement of undisputed material facts"],
  ["2026-10-16", "tk_park", 1.6, "L310", "A107", "Meet-and-confer call with opposing counsel regarding deficient interrogatory responses"],
  ["2026-10-20", "tk_chen", 1.0, "L250", "A104", "Revised draft opposition brief to strengthen waiver argument"],
  ["2026-10-22", "tk_moreno", 2.2, "L320", "A110", "Prepared privilege log entries for second rolling production"],
  ["2026-10-28", "tk_park", 1.3, "L160", "A105", "Prepared case status report for Acme legal department on discovery progress"],
];

const MOCK_ENTRIES: TimeEntry[] = ROWS.map(([date, tk, hours, taskCode, activityCode, narrative], i) => {
  const t = TK[tk];
  return {
    id: `te_${String(i + 1).padStart(2, "0")}`,
    invoiceId: DEMO.invoiceId,
    date,
    timekeeperId: tk,
    timekeeperName: t.name,
    role: t.role,
    hours,
    rate: t.rate,
    amount: round2(hours * t.rate),
    taskCode,
    activityCode,
    narrative,
    matterId: DEMO.matterId,
  };
});

const BILLED = round2(MOCK_ENTRIES.reduce((s, e) => s + e.amount, 0));

export const MOCK_INVOICE: Invoice = {
  id: DEMO.invoiceId,
  clientId: DEMO.clientId,
  matterId: DEMO.matterId,
  period: "2026-10",
  entries: MOCK_ENTRIES,
  totals: { billed: BILLED, atRisk: 0, entryCount: MOCK_ENTRIES.length, flaggedCount: 0 },
};

/* ───────────────────────────── Flags ───────────────────────────── */

const entryById = (id: string): TimeEntry => {
  const e = MOCK_ENTRIES.find((x) => x.id === id);
  if (!e) throw new Error(`mock entry ${id} missing`);
  return e;
};

function mkFlag(num: string, entryId: string, rule: Rule, message: string): Flag {
  const e = entryById(entryId);
  const impactUsd =
    rule.severity === "reject"
      ? e.amount
      : rule.severity === "reduce"
        ? round2(e.amount * (1 - (rule.adjustment?.factor ?? 0.5)))
        : 0;
  return {
    id: `flag_${num.replace(".", "_")}`,
    invoiceId: DEMO.invoiceId,
    entryId,
    ruleId: rule.id,
    clauseId: rule.clauseId,
    clauseNumber: num,
    ruleTitle: rule.title,
    severity: rule.severity,
    message,
    impactUsd,
    status: "open",
    suggestion: null,
  };
}

export const MOCK_FLAGS: Flag[] = [
  mkFlag("3.1", "te_03", RULE_3_1, "Narrative lists 3 separate tasks (document review, motion drafting, client call) in one 3.4-hour charge."),
  mkFlag("3.2", "te_04", RULE_3_2, "\"Attention to file\" is a prohibited non-descriptive phrase and has only 3 words."),
  mkFlag("3.3", "te_11", RULE_3_3, "3 timekeepers (Chen, Park, Moreno) billed for the Whitfield deposition on Oct 9; the limit is 2."),
  mkFlag("3.4", "te_08", RULE_3_4, "Non-working travel billed at the full $650 rate; must be billed at 50% ($325/hr)."),
  mkFlag("3.5", "te_06", RULE_3_5, "Organizing/indexing binders and scheduling a conference room are clerical tasks."),
  mkFlag("3.6", "te_16", RULE_3_6, "Sarah Okafor billed 11.0 hours on Oct 14 (cap is 10.0); this entry pushes the day over the cap."),
];

export function computeTotals(entries: TimeEntry[], flags: Flag[]): InvoiceTotals {
  const live = flags.filter((f) => f.status !== "dismissed");
  return {
    billed: round2(entries.reduce((s, e) => s + e.amount, 0)),
    atRisk: round2(live.reduce((s, f) => s + f.impactUsd, 0)),
    entryCount: entries.length,
    flaggedCount: new Set(live.map((f) => f.entryId)).size,
  };
}

export const MOCK_CHECK_RESULT: InvoiceCheckResult = {
  invoiceId: DEMO.invoiceId,
  rulebookId: DEMO.rulebookId,
  flags: MOCK_FLAGS,
  totals: computeTotals(MOCK_ENTRIES, MOCK_FLAGS),
};

/** Suggestions generated by mock suggestFix, keyed by clause number. */
export function mockSuggestion(flag: Flag, entry: TimeEntry | undefined): Suggestion {
  const rate = entry?.rate ?? 0;
  switch (flag.clauseNumber) {
    case "3.1":
      return {
        explanation: "Split the block-billed entry into three single-task entries so each task and its time are separately reviewable. Total hours unchanged (3.4).",
        splitEntries: [
          { date: entry?.date, hours: 1.4, rate, amount: round2(1.4 * rate), taskCode: "L310", activityCode: "A104", narrative: "Reviewed Brightline's second document production for responsiveness to RFP Nos. 4–9" },
          { date: entry?.date, hours: 1.5, rate, amount: round2(1.5 * rate), taskCode: "L310", activityCode: "A103", narrative: "Drafted motion to compel Brightline's deficient production" },
          { date: entry?.date, hours: 0.5, rate, amount: round2(0.5 * rate), taskCode: "L310", activityCode: "A106", narrative: "Call with Acme legal regarding revised discovery schedule" },
        ],
        verified: true,
      };
    case "3.2":
      return {
        explanation: "Rewrite the narrative to name the specific task and its subject matter. The rewrite was re-checked against all active rules.",
        narrative: "Reviewed Brightline's amended answer to assess impact of new affirmative defenses on discovery plan",
        verified: true,
      };
    case "3.4":
      return {
        explanation: "Re-bill non-working travel at 50% of the standard rate ($325/hr). Amount drops from $1,300 to $650.",
        splitEntries: [{ date: entry?.date, hours: entry?.hours, rate: round2(rate * 0.5), amount: round2((entry?.amount ?? 0) * 0.5), narrative: entry?.narrative }],
        verified: true,
      };
    case "3.6":
      return {
        explanation: "Reduce this entry to 0.5 hrs so the day totals exactly 10.0 hrs.",
        splitEntries: [{ date: entry?.date, hours: 0.5, rate, amount: round2(0.5 * rate), narrative: entry?.narrative }],
        verified: true,
      };
    case "3.3":
      return { explanation: "Write off the third attendee's time, or document why a third attendee was necessary and request client pre-approval.", verified: true };
    case "3.5":
      return { explanation: "Clerical work is firm overhead. Remove this entry from the invoice.", verified: true };
    default:
      return { explanation: "Revise the entry to comply with the cited clause.", verified: false };
  }
}

/* ───────────────────────────── Eval / review / audit ───────────────────────────── */

export const MOCK_EVAL: EvalResult = {
  invoiceId: DEMO.invoiceId,
  correct: 14,
  total: 15,
  perRule: [
    { ruleId: r("3.1"), clauseNumber: "3.1", title: RULE_3_1.title, tp: 1, fp: 0, fn: 0, precision: 1, recall: 1 },
    { ruleId: r("3.2"), clauseNumber: "3.2", title: RULE_3_2.title, tp: 1, fp: 0, fn: 0, precision: 1, recall: 1 },
    { ruleId: r("3.3"), clauseNumber: "3.3", title: RULE_3_3.title, tp: 1, fp: 0, fn: 0, precision: 1, recall: 1 },
    { ruleId: r("3.4"), clauseNumber: "3.4", title: RULE_3_4.title, tp: 1, fp: 0, fn: 1, precision: 1, recall: 0.5 },
    { ruleId: r("3.5"), clauseNumber: "3.5", title: RULE_3_5.title, tp: 1, fp: 0, fn: 0, precision: 1, recall: 1 },
    { ruleId: r("3.6"), clauseNumber: "3.6", title: RULE_3_6.title, tp: 1, fp: 0, fn: 0, precision: 1, recall: 1 },
  ],
  mismatches: [{ entryId: "te_12", expected: ["3.4"], actual: [] }],
};

export const MOCK_REVIEW: ReviewItem[] = [
  {
    id: "rev_cl_3_7",
    type: "judgment_clause",
    title: "§3.7 Reasonableness needs attorney interpretation",
    detail: "\"Reasonable and necessary\" has no objective threshold, so Lexer will not auto-enforce it. Review flagged-adjacent entries manually or add a firm-specific standard (e.g., max hours per task code).",
    refId: "cl_3_7",
    createdAt: "2026-10-12T15:06:10.000Z",
  },
  {
    id: "rev_flag_sept_3_2",
    type: "dismissed_flag",
    title: "Dismissed §3.2 flag on Sept. invoice entry te_0917",
    detail: "J. Rivera dismissed: \"Narrative is short but subject is clear from the task code (L240 – Dispositive motions).\" Consider refining the vague-narrative rule.",
    refId: "flag_sept_3_2",
    createdAt: "2026-09-30T19:12:00.000Z",
  },
];

export const MOCK_AUDIT: AuditEntry[] = [
  { id: "aud_1", actor: DEMO.approver, action: "rulebook.uploaded", targetType: "rulebook", targetId: DEMO.rulebookId, note: "Acme OCG 2026 (7 clauses)", createdAt: "2026-10-12T15:04:00.000Z" },
  { id: "aud_2", actor: "Lexer compiler", action: "rule.repaired", targetType: "rule", targetId: r("3.2"), note: "Attempt 1 failed 1/4 tests; repaired on attempt 2", createdAt: "2026-10-12T15:05:41.000Z" },
  { id: "aud_3", actor: "Lexer compiler", action: "rulebook.compiled", targetType: "rulebook", targetId: DEMO.rulebookId, note: "6 verified, 1 needs interpretation", createdAt: "2026-10-12T15:06:10.000Z" },
  { id: "aud_4", actor: DEMO.approver, action: "invoice.uploaded", targetType: "invoice", targetId: DEMO.invoiceId, note: "20 entries, matter ACME-LIT-0042", createdAt: "2026-10-12T15:30:00.000Z" },
  { id: "aud_5", actor: DEMO.approver, action: "flag.dismissed", targetType: "flag", targetId: "flag_sept_3_2", note: "Subject clear from task code", createdAt: "2026-09-30T19:12:00.000Z" },
  { id: "aud_6", actor: "Lexer eval", action: "eval.run", targetType: "invoice", targetId: DEMO.invoiceId, note: "14/15 entries match golden labels", createdAt: "2026-10-12T15:45:00.000Z" },
];

export function summarizeInvoice(inv: Invoice): InvoiceSummary {
  return { id: inv.id, matterId: inv.matterId, period: inv.period, totals: inv.totals };
}

export const MOCK_DASHBOARD: DashboardSummary = {
  client: { id: DEMO.clientId, name: DEMO.clientName },
  rulebook: summarizeRulebook(MOCK_RULEBOOK),
  latestInvoice: summarizeInvoice(MOCK_INVOICE),
};

/* ───────────────────────────── Compile stream script ───────────────────────────── */

export interface ScriptStep {
  /** delay in ms since the previous step */
  delayMs: number;
  event: CompileEvent;
}

const FIXTURE_BOOKS: Record<string, Rulebook> = {
  [MOCK_RULEBOOK.id]: MOCK_RULEBOOK,
  [MOCK_USCIS_RULEBOOK.id]: MOCK_USCIS_RULEBOOK,
};

/** Generic verified rule for a user-created rulebook (mock only). */
function genericRule(rb: Rulebook, clause: Clause): CompiledRule {
  const keyword = clause.title.split(/\s+/)[0]?.toLowerCase() ?? "task";
  const isTime = rb.recordType === "time_entry";
  const dsl: Rule = {
    id: `rule_${clause.id}`,
    clauseId: clause.id,
    title: clause.title,
    severity: "warn",
    scope: "entry",
    recordType: rb.recordType,
    violation: isTime
      ? { field: "narrative", op: "contains_any", value: [keyword] }
      : { field: "offeredWage", op: "lt_field", value: "lcaPrevailingWage" },
    message: `Possible conflict with §${clause.number} ${clause.title}.`,
  };
  const tests: RuleTest[] = [
    { name: `Mentions "${keyword}" → flagged`, records: [isTime ? { narrative: `Work regarding ${keyword}` } : { offeredWage: 1, lcaPrevailingWage: 2 }], expectFlagged: true },
    { name: "Unrelated record → clean", records: [isTime ? { narrative: "Drafted brief" } : { offeredWage: 2, lcaPrevailingWage: 1 }], expectFlagged: false },
  ];
  return compiled(dsl.id, clause.id, dsl, tests);
}

/**
 * Scripted replay of the SSE compile stream (~12–15 s for Acme).
 * `source` lets callers pass a user-created rulebook not in the fixtures.
 */
export function mockCompileScript(rulebookId: string, source?: Rulebook): ScriptStep[] {
  const base = FIXTURE_BOOKS[rulebookId] ?? source;
  if (!base) {
    return [{ delayMs: 300, event: { type: "error", message: `Rulebook ${rulebookId} not found` } }];
  }
  const final: Rulebook = structuredClone(base);
  final.clauses = final.clauses.map((cl) =>
    cl.kind ? cl : { ...cl, kind: "compilable" as const, kindReason: "Objective, checkable requirement." },
  );
  if (final.rules.length === 0) {
    final.rules = final.clauses.map((cl) => genericRule(final, cl));
  }

  const steps: ScriptStep[] = [];
  const push = (delayMs: number, event: CompileEvent) => steps.push({ delayMs, event });

  push(200, { type: "started", rulebookId, clauseCount: final.clauses.length });
  for (const cl of final.clauses) {
    const { kind: _k, kindReason: _r, ...bare } = cl;
    void _k;
    void _r;
    push(350, { type: "clause_found", clause: bare });
  }

  for (const cl of final.clauses) {
    const rule = final.rules.find((x) => x.clauseId === cl.id);
    const ruleId = rule?.id ?? `rule_${cl.id}`;
    const kind: ClauseKind = cl.kind ?? "compilable";
    push(250, { type: "classified", clauseId: cl.id, kind, reason: cl.kindReason ?? "" });

    if (kind !== "compilable" || !rule || !rule.dsl) {
      push(350, { type: "rule_status", clauseId: cl.id, ruleId, status: "needs_interpretation", attempt: 0 });
      continue;
    }

    push(350, { type: "rule_status", clauseId: cl.id, ruleId, status: "compiling", attempt: 1 });
    push(450, { type: "rule_status", clauseId: cl.id, ruleId, status: "testing", attempt: 1 });

    const needsRepair = rulebookId === DEMO.rulebookId && cl.id === "cl_3_2";
    if (needsRepair) {
      push(400, { type: "test_results", clauseId: cl.id, ruleId, results: MOCK_3_2_FIRST_ATTEMPT_RESULTS });
      push(500, { type: "rule_status", clauseId: cl.id, ruleId, status: "repairing", attempt: 2 });
      push(700, { type: "rule_status", clauseId: cl.id, ruleId, status: "testing", attempt: 2 });
    }
    push(400, { type: "test_results", clauseId: cl.id, ruleId, results: rule.testResults });
    push(250, { type: "rule_compiled", rule });
  }

  push(300, { type: "done", rulebook: final });
  return steps;
}
