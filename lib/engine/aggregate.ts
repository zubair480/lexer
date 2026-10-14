import type { Aggregate, EngineFlag, EngineRecord, Rule } from "./types";
import { isAggregate } from "./types";
import { getField } from "./ops";
import { appliesTo, evaluateEntryRule } from "./evaluate";
import { computeImpact } from "./impact";

function toNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function compute(agg: Aggregate, group: EngineRecord[]): number {
  switch (agg.fn) {
    case "count":
      return group.length;
    case "sum":
      return group.reduce((s, r) => s + toNum(getField(r, agg.field)), 0);
    case "count_distinct": {
      const seen = new Set<string>();
      for (const r of group) {
        const v = getField(r, agg.field);
        if (v === undefined || v === null || v === "") continue;
        seen.add(typeof v === "string" ? v.trim().toLowerCase() : JSON.stringify(v));
      }
      return seen.size;
    }
    default:
      return 0;
  }
}

function compare(op: Aggregate["op"], actual: number, value: number): boolean {
  switch (op) {
    case "gt": return actual > value;
    case "gte": return actual >= value;
    case "lt": return actual < value;
    case "lte": return actual <= value;
    default: return false;
  }
}

export function evaluateGroupRule(rule: Rule, records: EngineRecord[]): EngineFlag[] {
  if (!isAggregate(rule.violation)) return evaluateEntryRule(rule, records);
  const agg = rule.violation;
  const applicable = records.filter((r) => appliesTo(rule, r));
  const groups = new Map<string, EngineRecord[]>();
  for (const r of applicable) {
    const key = JSON.stringify((agg.groupBy ?? []).map((f) => getField(r, f) ?? null));
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }
  const violating = new Set<EngineRecord>();
  for (const group of groups.values()) {
    if (compare(agg.op, compute(agg, group), toNum(agg.value))) {
      for (const r of group) violating.add(r);
    }
  }
  // Emit in original record order.
  const flags: EngineFlag[] = [];
  for (const r of applicable) {
    if (!violating.has(r)) continue;
    flags.push({
      ruleId: rule.id,
      clauseId: rule.clauseId,
      entryId: String(r.id ?? ""),
      severity: rule.severity,
      message: rule.message,
      impactUsd: computeImpact(rule, r),
    });
  }
  return flags;
}
