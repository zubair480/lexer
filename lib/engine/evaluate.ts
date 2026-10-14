// B2 — entry-scope rule evaluation. Pure.
import type { Condition, EngineFlag, EngineRecord, Field, Rule } from "./types";
import { isAggregate } from "./types";
import { applyOp, getField } from "./ops";
import { computeImpact } from "./impact";

export function evalCondition(cond: Condition, record: EngineRecord): boolean {
  if (!cond || typeof cond !== "object") return false;
  if ("all" in cond && Array.isArray(cond.all)) return cond.all.every((c) => evalCondition(c, record));
  if ("any" in cond && Array.isArray(cond.any)) return cond.any.some((c) => evalCondition(c, record));
  if ("not" in cond && cond.not) return !evalCondition(cond.not, record);
  if ("field" in cond && "op" in cond) {
    const actual = getField(record, cond.field as Field);
    return applyOp(cond.op, actual, cond.value, record);
  }
  return false;
}

export function appliesTo(rule: Rule, record: EngineRecord): boolean {
  if (!rule.when) return true;
  return evalCondition(rule.when, record);
}

export function evaluateEntryRule(rule: Rule, records: EngineRecord[]): EngineFlag[] {
  if (isAggregate(rule.violation)) return [];
  const violation = rule.violation as Condition;
  const flags: EngineFlag[] = [];
  for (const record of records) {
    if (!appliesTo(rule, record)) continue;
    if (!evalCondition(violation, record)) continue;
    flags.push({
      ruleId: rule.id,
      clauseId: rule.clauseId,
      entryId: record.id ?? "",
      severity: rule.severity,
      message: rule.message,
      impactUsd: computeImpact(rule, record),
    });
  }
  return flags;
}
