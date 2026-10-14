import type { EngineFlag, EngineRecord, Rule, RuleTest, TestResult } from "./types";
import { isAggregate } from "./types";
import { evaluateEntryRule } from "./evaluate";
import { evaluateGroupRule } from "./aggregate";

export * from "./types";
export * from "./ops";
export * from "./evaluate";
export * from "./aggregate";
export * from "./impact";

export function evaluateRule(rule: Rule, records: EngineRecord[]): EngineFlag[] {
  if (isAggregate(rule.violation)) return evaluateGroupRule(rule, records);
  return evaluateEntryRule(rule, records);
}

function withIds(records: Record<string, unknown>[] | undefined): EngineRecord[] {
  if (!Array.isArray(records)) return [];
  return records.map((r, i) => {
    const rec = (r && typeof r === "object" ? r : {}) as EngineRecord;
    return rec.id === undefined || rec.id === null || rec.id === "" ? { ...rec, id: `t${i}` } : rec;
  });
}

export function runTests(rule: Rule, tests: RuleTest[]): TestResult[] {
  return (tests ?? []).map((test) => {
    let actualFlagged = false;
    try {
      actualFlagged = evaluateRule(rule, withIds(test.records)).length > 0;
    } catch {
      actualFlagged = false;
    }
    const expectFlagged = !!test.expectFlagged;
    return { name: test.name, expectFlagged, actualFlagged, passed: actualFlagged === expectFlagged };
  });
}

export function checkRecords(rules: Rule[], records: EngineRecord[]): EngineFlag[] {
  const perRule = rules.map((rule) => {
    try {
      return evaluateRule(rule, records);
    } catch {
      return [] as EngineFlag[];
    }
  });
  const out: EngineFlag[] = [];
  const done = new Set<string>();
  records.forEach((rec) => {
    const id = String(rec.id ?? "");
    if (done.has(id)) return;
    done.add(id);
    perRule.forEach((flags) => {
      for (const f of flags) if (f.entryId === id) out.push(f);
    });
  });
  return out;
}
