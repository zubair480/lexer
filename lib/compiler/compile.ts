// B7 — clause -> tested rule. Compile, run the rule's own tests, repair up to 3 attempts total.
import type { Clause, RecordType, Rule, RuleTest, TestResult } from "@/shared/contract";
import { llmStructured, LlmValidationError } from "@/lib/server/llm";
import { runTests } from "@/lib/engine";
import { CompileOutputSchema } from "./schemas";
import { buildCompileSystem, buildCompileUser } from "./prompts";
import { normalizeRule, normalizeTests, validateRule } from "./normalize";
import { repairRule } from "./repair";

export type CompileProgress =
  | { kind: "status"; status: "compiling" | "testing" | "repairing"; attempt: number }
  | { kind: "tests"; attempt: number; results: TestResult[] };

export interface CompileClauseResult {
  status: "verified" | "uncertain";
  attempts: number;
  rule: Rule | null;
  tests: RuleTest[];
  testResults: TestResult[];
}

export const MAX_ATTEMPTS = 3;
const MIN_POS = 2;
const MIN_NEG = 2;

function describeError(e: unknown): string {
  if (e instanceof LlmValidationError) {
    let issues = "";
    try {
      issues = JSON.stringify(e.issues).slice(0, 1500);
    } catch {
      issues = String(e.issues);
    }
    let raw = "";
    try {
      raw = JSON.stringify(e.raw).slice(0, 1500);
    } catch {
      raw = String(e.raw);
    }
    return `${e.message}. Schema issues: ${issues}. Raw output (truncated): ${raw}`;
  }
  if (e instanceof Error) return e.message;
  return String(e);
}

function safeEmit(onProgress: ((p: CompileProgress) => void) | undefined, p: CompileProgress) {
  try {
    onProgress?.(p);
  } catch {
    // progress callbacks must never break compilation
  }
}

export async function compileClause(
  clause: Clause,
  recordType: RecordType,
  onProgress?: (p: CompileProgress) => void,
): Promise<CompileClauseResult> {
  let rule: Rule | null = null;
  let tests: RuleTest[] = [];
  let testResults: TestResult[] = [];
  let failures: TestResult[] = [];
  let error: string | undefined;
  let attempts = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    attempts = attempt;
    safeEmit(onProgress, { kind: "status", status: attempt === 1 ? "compiling" : "repairing", attempt });

    // 1) Ask the LLM (compile on attempt 1, repair afterwards).
    try {
      if (attempt === 1) {
        const out = await llmStructured({
          name: "compile_rule",
          schema: CompileOutputSchema,
          system: buildCompileSystem(recordType),
          user: buildCompileUser(clause, recordType),
        });
        rule = normalizeRule(out.rule, clause, recordType);
        tests = normalizeTests(out.tests);
      } else {
        const out = await repairRule({ clause, recordType, rule, tests, failures, error });
        rule = out.rule;
        tests = out.tests;
      }
      error = undefined;
    } catch (e) {
      error = describeError(e);
      failures = [];
      // Keep the previous rule/tests (if any) so repair has something to work with.
      continue;
    }

    // 2) Static validation.
    const problems = validateRule(rule, recordType);
    if (problems.length) {
      error = `Rule validation failed: ${problems.join("; ")}`;
    }

    // 3) Run the rule's own tests.
    safeEmit(onProgress, { kind: "status", status: "testing", attempt });
    try {
      testResults = runTests(rule, tests);
    } catch (e) {
      testResults = [];
      error = `Engine error while running tests: ${describeError(e)}`;
      failures = [];
      continue;
    }
    safeEmit(onProgress, { kind: "tests", attempt, results: testResults });
    failures = testResults.filter((r) => !r.passed);

    const pos = tests.filter((t) => t.expectFlagged).length;
    const neg = tests.filter((t) => !t.expectFlagged).length;
    if (pos < MIN_POS || neg < MIN_NEG) {
      const countErr = `Need at least ${MIN_POS} tests with expectFlagged=true and ${MIN_NEG} with expectFlagged=false; got ${pos} true and ${neg} false. Add tests.`;
      error = error ? `${error}\n${countErr}` : countErr;
    }

    if (!error && failures.length === 0 && testResults.length > 0) {
      return { status: "verified", attempts, rule, tests, testResults };
    }
  }

  return { status: "uncertain", attempts, rule, tests, testResults };
}
