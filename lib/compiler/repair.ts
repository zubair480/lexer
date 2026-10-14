// B7 — ask the LLM to repair a rule (or a contradictory test) given failing test results.
import type { Clause, RecordType, Rule, RuleTest, TestResult } from "@/shared/contract";
import { llmStructured } from "@/lib/server/llm";
import { CompileOutputSchema } from "./schemas";
import { buildRepairSystem, buildRepairUser } from "./prompts";
import { normalizeRule, normalizeTests } from "./normalize";

export async function repairRule(input: {
  clause: Clause;
  recordType: RecordType;
  rule: Rule | null;
  tests: RuleTest[];
  failures: TestResult[];
  error?: string;
}): Promise<{ rule: Rule; tests: RuleTest[] }> {
  const out = await llmStructured({
    name: "repair_rule",
    schema: CompileOutputSchema,
    system: buildRepairSystem(input.recordType),
    user: buildRepairUser(input),
  });
  return {
    rule: normalizeRule(out.rule, input.clause, input.recordType),
    tests: normalizeTests(out.tests),
  };
}
