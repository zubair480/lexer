// B7 — turn validated LLM output into contract-shaped Rule/RuleTest, and sanity-check it.
import type { Aggregate, Clause, Condition, RecordType, Rule, RuleTest } from "@/shared/contract";
import { isAggregate } from "@/lib/engine/types";
import type { LlmRule, LlmRuleTest } from "./schemas";
import { H1B_FIELDS, TIME_ENTRY_FIELDS } from "./schemas";

export function normalizeRule(raw: LlmRule, clause: Clause, recordType: RecordType): Rule {
  const violation = raw.violation as Condition | Aggregate;
  const rule: Rule = {
    id: `rule_${clause.id}`,
    clauseId: clause.id,
    title: raw.title || clause.title,
    severity: raw.severity,
    scope: isAggregate(violation) ? "group" : "entry",
    recordType,
    violation,
    message: raw.message || `Violates §${clause.number}: ${clause.title}`,
  };
  if (raw.when) rule.when = raw.when as Condition;
  if (raw.adjustment && typeof raw.adjustment.factor === "number" && Number.isFinite(raw.adjustment.factor)) {
    rule.adjustment = { type: "rate_factor", factor: raw.adjustment.factor };
  }
  return rule;
}

export function normalizeTests(raw: LlmRuleTest[]): RuleTest[] {
  return raw.map((t, i) => ({
    name: t.name || `test ${i + 1}`,
    expectFlagged: t.expectFlagged,
    records: (t.records ?? []).map((r) => ({ ...r })),
  }));
}

/** Returns a list of human-readable problems (empty = OK). */
export function validateRule(rule: Rule, recordType: RecordType): string[] {
  const problems: string[] = [];
  const allowed = new Set<string>(recordType === "h1b_petition" ? H1B_FIELDS : TIME_ENTRY_FIELDS);
  const checkField = (f: string, where: string) => {
    if (!allowed.has(f)) problems.push(`${where}: field "${f}" is not a ${recordType} field`);
  };
  const walk = (c: Condition, where: string) => {
    if (!c || typeof c !== "object") {
      problems.push(`${where}: condition is not an object`);
      return;
    }
    if ("all" in c) return c.all.forEach((x, i) => walk(x, `${where}.all[${i}]`));
    if ("any" in c) return c.any.forEach((x, i) => walk(x, `${where}.any[${i}]`));
    if ("not" in c) return walk(c.not, `${where}.not`);
    checkField(c.field, where);
    if (c.op === "matches") {
      if (typeof c.value !== "string") problems.push(`${where}: "matches" needs a regex string value`);
      else {
        try {
          new RegExp(c.value, "i");
        } catch (e) {
          problems.push(`${where}: invalid regex ${JSON.stringify(c.value)} (${(e as Error).message})`);
        }
      }
    }
    if (c.op === "contains_any" && !Array.isArray(c.value)) {
      problems.push(`${where}: "contains_any" needs a string[] value`);
    }
    if ((c.op === "gt_field" || c.op === "lt_field" || c.op === "not_in_field") && typeof c.value === "string") {
      checkField(c.value, `${where}.value`);
    }
  };
  if (rule.when) walk(rule.when, "when");
  if (isAggregate(rule.violation)) {
    rule.violation.groupBy.forEach((f) => checkField(f, "violation.groupBy"));
    checkField(rule.violation.field, "violation.field");
  } else {
    walk(rule.violation, "violation");
  }
  if (rule.severity === "reduce" && rule.adjustment && (rule.adjustment.factor < 0 || rule.adjustment.factor > 1)) {
    problems.push(`adjustment.factor must be between 0 and 1 (got ${rule.adjustment.factor})`);
  }
  return problems;
}
