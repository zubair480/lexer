// B7 — prompts for compiling a clause into a tested Rule DSL program, and for repairing it.
// NOTE: prompts must be deterministic (no timestamps/random) — they are part of the LLM cache key.
import type { Clause, RecordType, Rule, RuleTest, TestResult } from "@/shared/contract";

const DSL_SPEC = `
## Rule DSL (TypeScript types — your output MUST conform)

type TimeEntryField = "date" | "timekeeperId" | "role" | "hours" | "rate" | "amount"
  | "taskCode" | "activityCode" | "narrative" | "matterId";
type H1BField = "offeredWage" | "lcaPrevailingWage" | "worksiteZip" | "lcaWorksiteZips"
  | "filingDate" | "requestedStartDate" | "daysBeforeStart";
type Field = TimeEntryField | H1BField;

type Op =
  | "eq" | "neq" | "gt" | "gte" | "lt" | "lte"
  | "in" | "not_in"
  | "matches"           // value: regex string, case-insensitive
  | "contains_any"      // value: string[] of phrases, case-insensitive substring match
  | "word_count_lt"     // value: number
  | "segment_count_gt"  // value: number; segments split on ";" , " and " , "&" , ","
  | "not_multiple_of"   // value: number, e.g. 0.1
  | "gt_field" | "lt_field" | "not_in_field"; // value: ANOTHER Field name (compare two fields of the same record)

type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { field: Field; op: Op; value: unknown };

interface Aggregate {          // group rule: violation computed over groups of records
  groupBy: Field[];
  fn: "count_distinct" | "sum" | "count";
  field: Field;
  op: "gt" | "gte" | "lt" | "lte";
  value: number;
}

interface Rule {
  id: string;                 // leave "" — assigned by the system
  clauseId: string;           // leave "" — assigned by the system
  title: string;              // short, e.g. "Block billing"
  severity: "reject" | "reduce" | "warn";
  scope: "entry" | "group";   // "group" iff violation is an Aggregate
  recordType: "time_entry" | "h1b_petition";
  when?: Condition;           // optional: which records the rule applies to (filter)
  violation: Condition | Aggregate;  // true => the record is flagged
  adjustment?: { type: "rate_factor"; factor: number }; // only for "reduce", e.g. 0.5 = billed at 50%
  message: string;            // human explanation; MUST reference the clause number, e.g. "Violates §3.1: ..."
}

interface RuleTest {
  name: string;
  records: Record<string, unknown>[];  // realistic, COMPLETE records
  expectFlagged: boolean;              // true if evaluating the rule over these records flags at least one record
}

Output JSON: { "rule": Rule, "tests": RuleTest[] }

## Exact engine semantics (deterministic evaluator — reason about these precisely)
- String comparisons are case-insensitive and trimmed. eq/neq/in/not_in compare numerically when both sides are numeric.
- gt/gte/lt/lte compare numerically; if both sides are non-numeric strings they compare lexicographically (ISO dates "YYYY-MM-DD" work).
- A MISSING field (undefined/null) NEVER flags: any leaf on a missing field is false. (Beware: { not: leaf } on a missing field is then TRUE.)
- contains_any: true if the field text contains ANY of the phrases (substring, case-insensitive). Prefer this over regex.
- matches: JavaScript regex, case-insensitive flag "i". Avoid lookbehind and complex regexes; keep them simple.
- word_count_lt: number of whitespace-separated words < value.
- segment_count_gt: text split on ";", "&", ",", and the whole word "and" (case-insensitive); count non-empty parts; true if count > value.
  e.g. "Drafted motion; reviewed exhibits and called client" = 3 segments. "Reviewed and revised draft motion" = 2 segments.
- not_multiple_of: true if field/value is not an integer (e.g. hours 0.25 with value 0.1).
- gt_field / lt_field / not_in_field: value is another field NAME; compares to that field on the same record. not_in_field: true if this field's value is not in the other field's list.
- Entry rules (scope "entry"): a record is flagged iff (when absent OR when is true) AND violation is true.
- Group rules (scope "group", violation is Aggregate): records are first FILTERED by "when"; the remaining records are grouped by the groupBy fields;
  fn is computed over "field" in each group (count = number of records, count_distinct = distinct non-empty values, sum = numeric sum);
  if (fn result) op value is true, EVERY record in that group is flagged.
- A test passes iff (at least one record flagged) === expectFlagged.
`;

const TIME_ENTRY_FIELDS_DOC = `
## Record type: time_entry (law-firm invoice line, LEDES-style). Fields and example values:
- id: "e07"
- date: "2026-10-14" (YYYY-MM-DD)
- timekeeperId: "TK01" | "TK02" | "TK03"
- timekeeperName: "Dana Whitfield"
- role: "partner" | "associate" | "paralegal"
- hours: 1.5 (decimal hours)
- rate: 950 (partner) | 620 (associate) | 280 (paralegal)
- amount: 1425 (= hours * rate)
- taskCode: UTBMS task code, e.g. "L110" (fact investigation), "L120" (analysis/strategy), "L210" (pleadings), "L250" (motions), "L310" (written discovery), "L330" (depositions)
- activityCode: UTBMS activity code, e.g. "A101" (plan and prepare), "A102" (research), "A103" (draft/revise), "A104" (review/analyze), "A105" (communicate within team), "A106" (communicate with client), "A109" (attend deposition or meeting), "A110" (manage data/files — clerical-ish)
- narrative: free text, e.g. "Drafted motion to compel production of custodial emails"
- matterId: "ACME-LIT-0042"
Conventions in the data: attending a deposition or meeting uses activityCode "A109". Non-working travel narratives start with "Non-working travel" (e.g. "Non-working travel to Chicago for deposition of J. Smith").
Clerical narratives look like "Organized and filed exhibits", "Copied production set", "Scheduled deposition with court reporter".
`;

const H1B_FIELDS_DOC = `
## Record type: h1b_petition (synthetic H-1B petition). Fields and example values:
- id: "pet_01"
- beneficiaryName: "Priya Raman"
- employerName: "Acme Corp"
- offeredWage: 98000 (annual USD)
- lcaPrevailingWage: 105000 (annual USD, from the certified LCA)
- worksiteZip: "94105"
- lcaWorksiteZips: ["94105", "10001"] (worksite ZIPs listed on the certified LCA)
- filingDate: "2026-03-02"
- requestedStartDate: "2026-10-01"
- daysBeforeStart: DERIVED integer = days from filingDate to requestedStartDate (computed automatically if absent; you may also rely on filingDate/requestedStartDate in tests).
Useful patterns: { "field": "offeredWage", "op": "lt_field", "value": "lcaPrevailingWage" }; { "field": "worksiteZip", "op": "not_in_field", "value": "lcaWorksiteZips" }; { "field": "daysBeforeStart", "op": "gt", "value": 180 }.
`;

const WORKED_EXAMPLES = `
## Worked example 1 — entry rule
Clause §3.2 "Vague narratives": Narratives must be specific. Entries under five words, or using "attention to", "work on file", or "review documents" without identifying the subject, will be rejected.
{
  "rule": {
    "id": "", "clauseId": "", "title": "Vague narrative", "severity": "reject", "scope": "entry", "recordType": "time_entry",
    "violation": { "any": [
      { "field": "narrative", "op": "word_count_lt", "value": 5 },
      { "field": "narrative", "op": "contains_any", "value": ["attention to", "work on file", "review documents"] }
    ] },
    "message": "Violates §3.2: narrative is vague (under five words or a generic phrase without a subject)."
  },
  "tests": [
    { "name": "generic 'attention to file' is flagged", "expectFlagged": true, "records": [
      { "id": "t1", "date": "2026-10-06", "timekeeperId": "TK02", "timekeeperName": "Marcus Lee", "role": "associate", "hours": 0.8, "rate": 620, "amount": 496, "taskCode": "L120", "activityCode": "A104", "narrative": "Attention to file", "matterId": "ACME-LIT-0042" } ] },
    { "name": "four-word narrative is flagged", "expectFlagged": true, "records": [
      { "id": "t2", "date": "2026-10-07", "timekeeperId": "TK01", "timekeeperName": "Dana Whitfield", "role": "partner", "hours": 0.5, "rate": 950, "amount": 475, "taskCode": "L120", "activityCode": "A106", "narrative": "Call with client re", "matterId": "ACME-LIT-0042" } ] },
    { "name": "specific narrative passes", "expectFlagged": false, "records": [
      { "id": "t3", "date": "2026-10-08", "timekeeperId": "TK02", "timekeeperName": "Marcus Lee", "role": "associate", "hours": 2.1, "rate": 620, "amount": 1302, "taskCode": "L250", "activityCode": "A103", "narrative": "Drafted motion to compel production of custodial emails", "matterId": "ACME-LIT-0042" } ] },
    { "name": "near miss: reviews a named document, five+ words", "expectFlagged": false, "records": [
      { "id": "t4", "date": "2026-10-09", "timekeeperId": "TK01", "timekeeperName": "Dana Whitfield", "role": "partner", "hours": 0.6, "rate": 950, "amount": 570, "taskCode": "L310", "activityCode": "A104", "narrative": "Reviewed plaintiff's second set of interrogatories", "matterId": "ACME-LIT-0042" } ] }
  ]
}

## Worked example 2 — group rule
Clause §3.3 "Staffing": No more than two timekeepers may bill for attending the same deposition or meeting (activity code A109) on the same day.
{
  "rule": {
    "id": "", "clauseId": "", "title": "Overstaffed deposition/meeting", "severity": "reject", "scope": "group", "recordType": "time_entry",
    "when": { "field": "activityCode", "op": "eq", "value": "A109" },
    "violation": { "groupBy": ["date", "activityCode"], "fn": "count_distinct", "field": "timekeeperId", "op": "gt", "value": 2 },
    "message": "Violates §3.3: more than two timekeepers billed for attending the same deposition or meeting on the same day."
  },
  "tests": [
    { "name": "three timekeepers at one deposition is flagged", "expectFlagged": true, "records": [
      { "id": "t1", "date": "2026-10-15", "timekeeperId": "TK01", "timekeeperName": "Dana Whitfield", "role": "partner", "hours": 6, "rate": 950, "amount": 5700, "taskCode": "L330", "activityCode": "A109", "narrative": "Attended deposition of R. Alvarez", "matterId": "ACME-LIT-0042" },
      { "id": "t2", "date": "2026-10-15", "timekeeperId": "TK02", "timekeeperName": "Marcus Lee", "role": "associate", "hours": 6, "rate": 620, "amount": 3720, "taskCode": "L330", "activityCode": "A109", "narrative": "Attended deposition of R. Alvarez; took notes", "matterId": "ACME-LIT-0042" },
      { "id": "t3", "date": "2026-10-15", "timekeeperId": "TK03", "timekeeperName": "Sofia Kim", "role": "paralegal", "hours": 6, "rate": 280, "amount": 1680, "taskCode": "L330", "activityCode": "A109", "narrative": "Attended deposition of R. Alvarez to manage exhibits", "matterId": "ACME-LIT-0042" } ] },
    { "name": "three timekeepers at one meeting is flagged", "expectFlagged": true, "records": [
      { "id": "t4", "date": "2026-10-20", "timekeeperId": "TK01", "timekeeperName": "Dana Whitfield", "role": "partner", "hours": 1, "rate": 950, "amount": 950, "taskCode": "L120", "activityCode": "A109", "narrative": "Attended case strategy meeting with client", "matterId": "ACME-LIT-0042" },
      { "id": "t5", "date": "2026-10-20", "timekeeperId": "TK02", "timekeeperName": "Marcus Lee", "role": "associate", "hours": 1, "rate": 620, "amount": 620, "taskCode": "L120", "activityCode": "A109", "narrative": "Attended case strategy meeting with client", "matterId": "ACME-LIT-0042" },
      { "id": "t6", "date": "2026-10-20", "timekeeperId": "TK03", "timekeeperName": "Sofia Kim", "role": "paralegal", "hours": 1, "rate": 280, "amount": 280, "taskCode": "L120", "activityCode": "A109", "narrative": "Attended case strategy meeting with client", "matterId": "ACME-LIT-0042" } ] },
    { "name": "near miss: exactly two timekeepers at a meeting", "expectFlagged": false, "records": [
      { "id": "t7", "date": "2026-10-21", "timekeeperId": "TK01", "timekeeperName": "Dana Whitfield", "role": "partner", "hours": 1.5, "rate": 950, "amount": 1425, "taskCode": "L120", "activityCode": "A109", "narrative": "Attended client strategy meeting re settlement posture", "matterId": "ACME-LIT-0042" },
      { "id": "t8", "date": "2026-10-21", "timekeeperId": "TK02", "timekeeperName": "Marcus Lee", "role": "associate", "hours": 1.5, "rate": 620, "amount": 930, "taskCode": "L120", "activityCode": "A109", "narrative": "Attended client strategy meeting re settlement posture", "matterId": "ACME-LIT-0042" } ] },
    { "name": "three timekeepers on different days is not flagged", "expectFlagged": false, "records": [
      { "id": "t9", "date": "2026-10-22", "timekeeperId": "TK01", "timekeeperName": "Dana Whitfield", "role": "partner", "hours": 2, "rate": 950, "amount": 1900, "taskCode": "L330", "activityCode": "A109", "narrative": "Attended deposition of K. Osei", "matterId": "ACME-LIT-0042" },
      { "id": "t10", "date": "2026-10-23", "timekeeperId": "TK02", "timekeeperName": "Marcus Lee", "role": "associate", "hours": 2, "rate": 620, "amount": 1240, "taskCode": "L330", "activityCode": "A109", "narrative": "Attended deposition of L. Grant", "matterId": "ACME-LIT-0042" },
      { "id": "t11", "date": "2026-10-23", "timekeeperId": "TK03", "timekeeperName": "Sofia Kim", "role": "paralegal", "hours": 3, "rate": 280, "amount": 840, "taskCode": "L310", "activityCode": "A104", "narrative": "Reviewed document production for privilege", "matterId": "ACME-LIT-0042" } ] }
  ]
}
`;

const REQUIREMENTS = `
## Requirements
1. Compile the clause into ONE Rule that a deterministic engine can evaluate. Encode the clause literally; do not invent extra conditions.
2. Use scope "group" with an Aggregate violation ONLY for limits across multiple records (per day / per timekeeper / per event totals, counts of people). Otherwise scope "entry" with a Condition.
   - Daily hour caps per timekeeper: Aggregate { groupBy: ["timekeeperId", "date"], fn: "sum", field: "hours", op: "gt", value: <cap> }.
3. Severity: "not billable", "will be rejected", "will not be paid" => "reject". "billed at X% of rate" / "reduced" => "reduce" with adjustment { "type": "rate_factor", "factor": X/100 } (e.g. 50% => 0.5). Otherwise (should/encouraged/flag) => "warn".
4. "message" MUST reference the clause number, e.g. "Violates §3.1: ...".
5. Prefer simple, robust conditions: contains_any with several realistic phrasings over fragile regexes; thresholds exactly as stated in the clause (e.g. "exceed 0.5 hours" => hours gt 0.5).
6. Write 4–6 tests: at least 2 with expectFlagged true and at least 2 with expectFlagged false, including at least one NEAR MISS negative (looks similar but must not flag, e.g. just under a threshold).
7. Test records must be realistic, COMPLETE records with every field of the record type filled in (consistent amount = hours * rate). Group-rule tests MUST contain multiple records.
8. Double-check every test against the engine semantics above before answering — each test must pass against YOUR rule.
9. Leave "id" and "clauseId" as empty strings.
`;

function fieldsDoc(recordType: RecordType): string {
  return recordType === "h1b_petition" ? H1B_FIELDS_DOC : TIME_ENTRY_FIELDS_DOC;
}

export function buildCompileSystem(recordType: RecordType): string {
  return [
    "You are CounselLint's rule compiler. You translate one clause of a client's legal guidelines (outside-counsel billing guidelines or immigration filing rules) into an executable rule in a small JSON DSL, plus unit tests that prove the rule matches the clause.",
    DSL_SPEC,
    fieldsDoc(recordType),
    WORKED_EXAMPLES,
    REQUIREMENTS,
    "Respond with ONLY the JSON object { \"rule\": ..., \"tests\": [...] }.",
  ].join("\n");
}

export function buildCompileUser(clause: Clause, recordType: RecordType): string {
  return [
    `Record type: ${recordType}`,
    `Clause §${clause.number} "${clause.title}":`,
    clause.text,
    "",
    "Compile this clause into { rule, tests }.",
  ].join("\n");
}

export function buildRepairSystem(recordType: RecordType): string {
  return [
    "You are CounselLint's rule compiler, now in REPAIR mode. A previously compiled rule failed its own unit tests (or failed validation). Fix it.",
    DSL_SPEC,
    fieldsDoc(recordType),
    WORKED_EXAMPLES,
    REQUIREMENTS,
    `## Repair instructions
- Diagnose WHY each failing test fails using the exact engine semantics (expected vs actual flagged).
- Usually the RULE is wrong: fix the rule so it faithfully encodes the clause.
- Only change a TEST if the test itself contradicts the clause (wrong expectation or unrealistic record). Never weaken a test just to make it pass.
- If there was a validation error, fix the JSON shape so it conforms exactly to the DSL types.
- Return the COMPLETE corrected { rule, tests } (all tests, not just the changed ones), keeping at least 2 expectFlagged=true and at least 2 expectFlagged=false tests.
Respond with ONLY the JSON object { "rule": ..., "tests": [...] }.`,
  ].join("\n");
}

export function buildRepairUser(input: {
  clause: Clause;
  recordType: RecordType;
  rule: Rule | null;
  tests: RuleTest[];
  failures: TestResult[];
  error?: string;
}): string {
  const { clause, recordType, rule, tests, failures, error } = input;
  const lines: string[] = [
    `Record type: ${recordType}`,
    `Clause §${clause.number} "${clause.title}":`,
    clause.text,
    "",
    "## Current rule",
    rule ? JSON.stringify(rule, null, 2) : "(none — the previous attempt produced no valid rule)",
    "",
    "## Current tests",
    tests.length ? JSON.stringify(tests, null, 2) : "(none)",
    "",
  ];
  if (failures.length) {
    lines.push("## Failing tests");
    for (const f of failures) {
      lines.push(
        `- "${f.name}": expected flagged=${f.expectFlagged}, actual flagged=${f.actualFlagged}`,
      );
    }
    lines.push("");
  }
  if (error) {
    lines.push("## Validation / runtime error", error, "");
  }
  lines.push("Return the corrected { rule, tests }.");
  return lines.join("\n");
}
