/**
 * CounselLint — SHARED CONTRACT (single source of truth)
 *
 * Both the BACKEND session and the FRONTEND session import from this file.
 *   import type { ... } from "@/shared/contract";
 *
 * CHANGE PROTOCOL
 *  - Only the Backend Lead (B1) edits this file.
 *  - Changes must be ADDITIVE (new optional fields / new types). Never rename or remove.
 *  - Every change is logged in .coord/contract-changelog.md with a timestamp.
 *  - Frontend Lead (F1) watches the changelog and updates mocks.
 */

/* ───────────────────────────── Domain: records ───────────────────────────── */

export type Role = "partner" | "associate" | "paralegal";

/** One billed time entry (LEDES-1998B-inspired). Dates are "YYYY-MM-DD". */
export interface TimeEntry {
  id: string;
  invoiceId: string;
  date: string;
  timekeeperId: string;
  timekeeperName: string;
  role: Role;
  hours: number;
  rate: number;
  amount: number; // hours * rate
  taskCode: string; // UTBMS task code, e.g. "L120"
  activityCode: string; // UTBMS activity code, e.g. "A101"
  narrative: string;
  matterId: string;
}

/** P1 only: synthetic H-1B petition record used by the USCIS rulebook. */
export interface H1BPetition {
  id: string;
  beneficiaryName: string;
  employerName: string;
  offeredWage: number;
  lcaPrevailingWage: number;
  worksiteZip: string;
  lcaWorksiteZips: string[];
  filingDate: string;
  requestedStartDate: string;
}

export type RecordType = "time_entry" | "h1b_petition";

/* ───────────────────────────── Rule DSL (AST) ───────────────────────────── */

export type TimeEntryField =
  | "date" | "timekeeperId" | "role" | "hours" | "rate" | "amount"
  | "taskCode" | "activityCode" | "narrative" | "matterId";

export type H1BField =
  | "offeredWage" | "lcaPrevailingWage" | "worksiteZip" | "lcaWorksiteZips"
  | "filingDate" | "requestedStartDate" | "daysBeforeStart";

export type Field = TimeEntryField | H1BField;

export type Op =
  | "eq" | "neq" | "gt" | "gte" | "lt" | "lte"
  | "in" | "not_in"
  | "matches"           // value: regex string, case-insensitive
  | "contains_any"      // value: string[] of phrases, case-insensitive
  | "word_count_lt"     // value: number
  | "segment_count_gt"  // value: number; segments split on ";" , " and " , "&" , ","
  | "not_multiple_of"   // value: number, e.g. 0.1
  | "gt_field" | "lt_field" | "not_in_field"; // value: another Field name (compare two fields)

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { field: Field; op: Op; value: unknown };

export interface Aggregate {
  groupBy: Field[];
  fn: "count_distinct" | "sum" | "count";
  field: Field;
  op: "gt" | "gte" | "lt" | "lte";
  value: number;
}

export type Severity = "reject" | "reduce" | "warn";

export interface Rule {
  id: string;
  clauseId: string;
  title: string;
  severity: Severity;
  scope: "entry" | "group";
  recordType: RecordType;
  when?: Condition;                    // which records the rule applies to
  violation: Condition | Aggregate;    // true => flag
  adjustment?: { type: "rate_factor"; factor: number }; // e.g. travel billed at 0.5
  message: string;                     // human explanation
}

export interface RuleTest {
  name: string;
  records: Record<string, unknown>[];  // Partial<TimeEntry>[] or Partial<H1BPetition>[]
  expectFlagged: boolean;
}

export interface TestResult {
  name: string;
  expectFlagged: boolean;
  actualFlagged: boolean;
  passed: boolean;
}

/* ───────────────────────────── Rulebooks ───────────────────────────── */

export type ClauseKind = "compilable" | "judgment" | "informational";

export interface Clause {
  id: string;
  rulebookId: string;
  number: string;        // "3.1"
  title: string;         // "Block billing"
  text: string;
  start: number;         // char offset in Rulebook.sourceText
  end: number;
  kind?: ClauseKind;
  kindReason?: string;
}

export type RuleStatus =
  | "pending"
  | "compiling"
  | "testing"
  | "repairing"
  | "verified"              // passed its own tests, awaiting attorney approval
  | "uncertain"             // failed after max repair attempts -> human review
  | "needs_interpretation"  // judgment clause, never auto-enforced
  | "active";               // attorney approved, used in checks

export interface CompiledRule {
  id: string;
  clauseId: string;
  status: RuleStatus;
  attempts: number;         // 0..3
  dsl: Rule | null;
  tests: RuleTest[];
  testResults: TestResult[];
  approvedBy?: string;
  approvedAt?: string;
}

export interface Rulebook {
  id: string;
  clientId: string;
  clientName: string;
  title: string;
  recordType: RecordType;
  sourceText: string;
  clauses: Clause[];
  rules: CompiledRule[];
  createdAt: string;
}

export interface RulebookSummary {
  id: string;
  title: string;
  clientName: string;
  recordType: RecordType;
  clauseCount: number;
  statusCounts: Partial<Record<RuleStatus, number>>;
}

/* ───────────────────────────── Invoices & flags ───────────────────────────── */

export interface Suggestion {
  explanation: string;
  narrative?: string;                     // rewritten narrative
  splitEntries?: Partial<TimeEntry>[];    // for block billing: split into single-task entries
  verified: boolean;                      // re-checked against ALL active rules and passed
}

export type FlagStatus = "open" | "accepted" | "dismissed";

export interface Flag {
  id: string;
  invoiceId: string;
  entryId: string;          // TimeEntry.id (or H1BPetition.id)
  ruleId: string;
  clauseId: string;
  clauseNumber: string;
  ruleTitle: string;
  severity: Severity;
  message: string;
  impactUsd: number;        // reject = amount; reduce = amount * (1 - factor); warn = 0
  status: FlagStatus;
  note?: string;
  suggestion?: Suggestion | null;
}

export interface InvoiceTotals {
  billed: number;
  atRisk: number;
  entryCount: number;
  flaggedCount: number;
}

export interface Invoice {
  id: string;
  clientId: string;
  matterId: string;
  period: string;           // "2026-10"
  entries: TimeEntry[];
  totals: InvoiceTotals;
}

export interface InvoiceSummary {
  id: string;
  matterId: string;
  period: string;
  totals: InvoiceTotals;
}

export interface InvoiceCheckResult {
  invoiceId: string;
  rulebookId: string;
  flags: Flag[];
  totals: InvoiceTotals;
}

/* ───────────────────────────── Eval / review / audit ───────────────────────────── */

export interface EvalRuleRow {
  ruleId: string;
  clauseNumber: string;
  title: string;
  tp: number;
  fp: number;
  fn: number;
  precision: number;  // 0..1
  recall: number;     // 0..1
}

export interface EvalResult {
  invoiceId: string;
  correct: number;    // entries where flagged rule set == golden set
  total: number;      // labeled entries
  perRule: EvalRuleRow[];
  mismatches: { entryId: string; expected: string[]; actual: string[] }[]; // clause numbers
}

export type ReviewItemType = "uncertain_rule" | "judgment_clause" | "dismissed_flag";

export interface ReviewItem {
  id: string;
  type: ReviewItemType;
  title: string;
  detail: string;
  refId: string;        // ruleId / clauseId / flagId
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  actor: string;
  action: string;       // "rule.approved", "flag.dismissed", "rulebook.compiled", ...
  targetType: string;
  targetId: string;
  note?: string;
  createdAt: string;
}

export interface DashboardSummary {
  client: { id: string; name: string };
  rulebook: RulebookSummary | null;
  latestInvoice: InvoiceSummary | null;
}

/* ───────────────────────────── Compile stream (SSE) ───────────────────────────── */

/** Sent as `data: <JSON>\n\n` lines on GET /api/rulebooks/:id/compile/stream */
export type CompileEvent =
  | { type: "started"; rulebookId: string; clauseCount: number }
  | { type: "clause_found"; clause: Clause }
  | { type: "classified"; clauseId: string; kind: ClauseKind; reason: string }
  | { type: "rule_status"; clauseId: string; ruleId: string; status: RuleStatus; attempt: number }
  | { type: "test_results"; clauseId: string; ruleId: string; results: TestResult[] }
  | { type: "rule_compiled"; rule: CompiledRule }
  | { type: "done"; rulebook: Rulebook }
  | { type: "error"; message: string; clauseId?: string };

/* ───────────────────────────── HTTP API ───────────────────────────── */

/** All errors: HTTP 4xx/5xx with body ApiError. All success bodies are JSON unless noted. */
export interface ApiError { error: string }

export const API = {
  dashboard:        () => `/api/dashboard`,                             // GET  -> DashboardSummary
  rulebooks:        () => `/api/rulebooks`,                             // GET  -> RulebookSummary[] | POST CreateRulebookReq -> Rulebook
  rulebook:         (id: string) => `/api/rulebooks/${id}`,             // GET  -> Rulebook
  compileStream:    (id: string) => `/api/rulebooks/${id}/compile/stream`, // GET -> text/event-stream of CompileEvent
  approveRule:      (id: string) => `/api/rules/${id}/approve`,         // POST ApproveRuleReq -> CompiledRule
  approveAll:       (rulebookId: string) => `/api/rulebooks/${rulebookId}/approve-all`, // POST ApproveRuleReq -> Rulebook (approves all "verified")
  recompileRule:    (id: string) => `/api/rules/${id}/recompile`,       // POST -> CompiledRule
  invoices:         () => `/api/invoices`,                              // GET -> InvoiceSummary[] | POST CreateInvoiceReq -> Invoice
  invoice:          (id: string) => `/api/invoices/${id}`,              // GET -> Invoice
  checkInvoice:     (id: string) => `/api/invoices/${id}/check`,        // POST CheckInvoiceReq -> InvoiceCheckResult
  invoiceFlags:     (id: string) => `/api/invoices/${id}/flags`,        // GET -> Flag[]
  suggestFix:       (flagId: string) => `/api/flags/${flagId}/suggest`, // POST -> Flag (with suggestion)
  updateFlag:       (flagId: string) => `/api/flags/${flagId}`,         // PATCH UpdateFlagReq -> Flag
  evalInvoice:      (invoiceId: string) => `/api/eval/${invoiceId}`,    // GET -> EvalResult
  review:           () => `/api/review`,                                // GET -> ReviewItem[]
  audit:            () => `/api/audit`,                                 // GET -> AuditEntry[]
  demoReset:        () => `/api/demo/reset`,                            // POST -> { ok: true }
  uploadRulebook:   () => `/api/rulebooks/upload`,                      // POST multipart {file (.md/.txt/.pdf/.docx/.html), title?, clientName?, recordType?} -> Rulebook
  uploadInvoice:    () => `/api/invoices/upload`,                       // POST multipart {file (CSV or LEDES 1998B), clientId?, matterId?, period?} -> Invoice
} as const;

export interface CreateRulebookReq {
  title: string;
  clientName: string;
  recordType: RecordType;
  sourceText: string;
}
export interface ApproveRuleReq { approvedBy: string }
export interface CreateInvoiceReq { clientId: string; matterId: string; period: string; csv: string }
export interface CheckInvoiceReq { rulebookId: string }
export interface UpdateFlagReq { status: FlagStatus; note?: string }

/* ───────────────────────────── Seeded demo IDs (stable) ───────────────────────────── */

export const DEMO = {
  clientId: "acme",
  clientName: "Acme Corp",
  rulebookId: "rb_acme_ocg",
  uscisRulebookId: "rb_uscis_h1b",
  invoiceId: "inv_acme_2026_10",
  matterId: "ACME-LIT-0042",
  approver: "J. Rivera, Esq.",
} as const;
