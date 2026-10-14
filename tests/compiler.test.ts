import { afterEach, describe, expect, it } from "vitest";
import type { Clause } from "@/shared/contract";
import { setLlmOverride } from "@/lib/server/llm";
import { compileClause, type CompileProgress } from "@/lib/compiler/compile";

const clause: Clause = {
  id: "rb_test__3.2",
  rulebookId: "rb_test",
  number: "3.2",
  title: "Vague narratives",
  text: "Entries under five words will be rejected.",
  start: 0,
  end: 10,
};

const entry = (id: string, narrative: string) => ({
  id, date: "2026-10-06", timekeeperId: "TK02", timekeeperName: "Marcus Lee", role: "associate",
  hours: 0.8, rate: 620, amount: 496, taskCode: "L120", activityCode: "A104", narrative, matterId: "ACME-LIT-0042",
});

const tests = [
  { name: "short flagged", expectFlagged: true, records: [entry("a", "Attention to file")] },
  { name: "four words flagged", expectFlagged: true, records: [entry("b", "Call with client re")] },
  { name: "specific ok", expectFlagged: false, records: [entry("c", "Drafted motion to compel production of emails")] },
  { name: "near miss five words", expectFlagged: false, records: [entry("d", "Reviewed second set of interrogatories")] },
];

const goodRule = {
  id: "", clauseId: "", title: "Vague narrative", severity: "reject", scope: "entry", recordType: "time_entry",
  violation: { field: "narrative", op: "word_count_lt", value: 5 },
  message: "Violates §3.2: narrative under five words.",
};
const badRule = { ...goodRule, violation: { field: "narrative", op: "word_count_lt", value: 1 } };

afterEach(() => setLlmOverride(null));

describe("compileClause", () => {
  it("verifies a good rule on attempt 1", async () => {
    const names: string[] = [];
    setLlmOverride(async ({ name }) => {
      names.push(name);
      return { rule: goodRule, tests };
    });
    const res = await compileClause(clause, "time_entry");
    expect(res.status).toBe("verified");
    expect(res.attempts).toBe(1);
    expect(names).toEqual(["compile_rule"]);
    expect(res.rule?.id).toBe("rule_rb_test__3.2");
    expect(res.rule?.clauseId).toBe("rb_test__3.2");
    expect(res.rule?.scope).toBe("entry");
    expect(res.testResults.every((r) => r.passed)).toBe(true);
  });

  it("repairs a wrong rule on attempt 2", async () => {
    const names: string[] = [];
    setLlmOverride(async ({ name }) => {
      names.push(name);
      return name === "compile_rule" ? { rule: badRule, tests } : { rule: goodRule, tests };
    });
    const progress: CompileProgress[] = [];
    const res = await compileClause(clause, "time_entry", (p) => progress.push(p));
    expect(res.status).toBe("verified");
    expect(res.attempts).toBe(2);
    expect(names).toEqual(["compile_rule", "repair_rule"]);
    expect(progress.some((p) => p.kind === "status" && p.status === "repairing" && p.attempt === 2)).toBe(true);
    expect(progress.filter((p) => p.kind === "tests")).toHaveLength(2);
  });

  it("gives up as uncertain after 3 failed attempts", async () => {
    let calls = 0;
    setLlmOverride(async () => {
      calls++;
      return { rule: badRule, tests };
    });
    const res = await compileClause(clause, "time_entry");
    expect(res.status).toBe("uncertain");
    expect(res.attempts).toBe(3);
    expect(calls).toBe(3);
    expect(res.rule).not.toBeNull();
    expect(res.testResults.some((r) => !r.passed)).toBe(true);
  });

  it("treats invalid output and too few tests as failed attempts (never throws)", async () => {
    let calls = 0;
    setLlmOverride(async () => {
      calls++;
      if (calls === 1) return { nonsense: true };
      if (calls === 2) return { rule: goodRule, tests: tests.slice(0, 3) };
      return { rule: goodRule, tests };
    });
    const res = await compileClause(clause, "time_entry");
    expect(res.status).toBe("verified");
    expect(res.attempts).toBe(3);
  });

  it("marks aggregate violations as group scope", async () => {
    const rec = (id: string, tk: string, date: string) => ({ ...entry(id, "Attended deposition of R. Alvarez"), timekeeperId: tk, date, activityCode: "A109" });
    setLlmOverride(async () => ({
      rule: {
        title: "Staffing", severity: "reject", message: "Violates §3.3",
        when: { field: "activityCode", op: "eq", value: "A109" },
        violation: { groupBy: ["date", "activityCode"], fn: "count_distinct", field: "timekeeperId", op: "gt", value: 2 },
      },
      tests: [
        { name: "3 same day", expectFlagged: true, records: [rec("a", "TK01", "2026-10-15"), rec("b", "TK02", "2026-10-15"), rec("c", "TK03", "2026-10-15")] },
        { name: "3 same day again", expectFlagged: true, records: [rec("d", "TK01", "2026-10-16"), rec("e", "TK02", "2026-10-16"), rec("f", "TK03", "2026-10-16")] },
        { name: "2 same day", expectFlagged: false, records: [rec("g", "TK01", "2026-10-15"), rec("h", "TK02", "2026-10-15")] },
        { name: "3 different days", expectFlagged: false, records: [rec("i", "TK01", "2026-10-15"), rec("j", "TK02", "2026-10-16"), rec("k", "TK03", "2026-10-17")] },
      ],
    }));
    const res = await compileClause({ ...clause, id: "rb_test__3.3", number: "3.3" }, "time_entry");
    expect(res.status).toBe("verified");
    expect(res.rule?.scope).toBe("group");
    expect(res.rule?.id).toBe("rule_rb_test__3.3");
  });
});
