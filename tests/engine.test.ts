import { describe, it, expect } from "vitest";
import {
  evaluateRule,
  runTests,
  checkRecords,
  evalCondition,
  computeImpact,
  segmentCount,
  getField,
} from "@/lib/engine";
import type { Rule, RuleTest, Condition, Op } from "@/shared/contract";

/* ───────────── synthetic fixtures (ACME-LIT-0042, Oct 2026) ───────────── */

const RATES = { partner: 950, associate: 620, paralegal: 280 } as const;
const TK = {
  partner: { timekeeperId: "TK-P01", timekeeperName: "Dana Whitfield", role: "partner" as const },
  associate: { timekeeperId: "TK-A07", timekeeperName: "Marcus Lee", role: "associate" as const },
  associate2: { timekeeperId: "TK-A09", timekeeperName: "Priya Nair", role: "associate" as const },
  paralegal: { timekeeperId: "TK-L03", timekeeperName: "Sam Ortiz", role: "paralegal" as const },
};

let seq = 0;
function entry(
  tk: keyof typeof TK,
  overrides: Partial<{
    id: string; date: string; hours: number; rate: number; amount: number;
    taskCode: string; activityCode: string; narrative: string;
  }> = {},
): Record<string, unknown> & { id: string } {
  const who = TK[tk];
  const hours = overrides.hours ?? 1.5;
  const rate = overrides.rate ?? RATES[who.role];
  return {
    id: overrides.id ?? `te_${++seq}`,
    invoiceId: "inv_acme_2026_10",
    date: overrides.date ?? "2026-10-05",
    ...who,
    hours,
    rate,
    amount: overrides.amount ?? Math.round(hours * rate * 100) / 100,
    taskCode: overrides.taskCode ?? "L120",
    activityCode: overrides.activityCode ?? "A104",
    narrative: overrides.narrative ?? "Review and analyze deposition transcript of plant manager re: safety protocols",
    matterId: "ACME-LIT-0042",
  };
}

function leafRule(cond: Condition, extra: Partial<Rule> = {}): Rule {
  return {
    id: "rule_test__1",
    clauseId: "rb_test__1",
    title: "Test rule",
    severity: "reject",
    scope: "entry",
    recordType: "time_entry",
    violation: cond,
    message: "Violation",
    ...extra,
  };
}

const flagsOf = (rule: Rule, recs: Record<string, unknown>[]) =>
  evaluateRule(rule, recs).map((f) => f.entryId).sort();

/* ───────────────────────────── helpers ───────────────────────────── */

describe("segmentCount / getField", () => {
  it("counts segments split on ; and , & and ' and '", () => {
    expect(segmentCount("Draft motion")).toBe(1);
    expect(segmentCount("Draft motion; review docs")).toBe(2);
    expect(segmentCount("Draft motion; review docs and call client")).toBe(3);
    expect(segmentCount("Draft motion, review docs & call client; email team")).toBe(4);
    expect(segmentCount("Draft motion AND call client")).toBe(2);
  });

  it("ignores empty segments", () => {
    expect(segmentCount("Draft motion;; ;")).toBe(1);
  });

  it("getField reads plain fields", () => {
    const r = entry("partner", { hours: 2 });
    expect(getField(r, "hours")).toBe(2);
    expect(getField(r, "role")).toBe("partner");
  });

  it("getField derives daysBeforeStart from filing/start dates", () => {
    const p = { id: "p1", filingDate: "2026-01-02", requestedStartDate: "2026-10-01" };
    expect(getField(p, "daysBeforeStart")).toBe(272);
    const q = { id: "p2", filingDate: "2026-06-01", requestedStartDate: "2026-10-01" };
    expect(getField(q, "daysBeforeStart")).toBe(122);
  });
});

/* ───────────────────────────── every Op ───────────────────────────── */

describe("evalCondition: every op", () => {
  const p = entry("partner", { hours: 2.5, rate: 950, taskCode: "L120", activityCode: "A104" });

  const cases: Array<[Op, string, unknown, boolean]> = [
    ["eq", "role", "partner", true],
    ["eq", "role", "associate", false],
    ["neq", "role", "associate", true],
    ["neq", "role", "partner", false],
    ["gt", "hours", 2, true],
    ["gt", "hours", 2.5, false],
    ["gte", "hours", 2.5, true],
    ["gte", "hours", 3, false],
    ["lt", "rate", 1000, true],
    ["lt", "rate", 950, false],
    ["lte", "rate", 950, true],
    ["lte", "rate", 900, false],
    ["in", "taskCode", ["L110", "L120"], true],
    ["in", "taskCode", ["L310"], false],
    ["not_in", "activityCode", ["A101", "A102"], true],
    ["not_in", "activityCode", ["A104"], false],
  ];
  it.each(cases)("%s on %s vs %j ⇒ %s", (op, field, value, expected) => {
    expect(evalCondition({ field: field as never, op, value }, p)).toBe(expected);
  });

  it("matches is a case-insensitive regex", () => {
    const r = entry("associate", { narrative: "Attention to FILE organization" });
    expect(evalCondition({ field: "narrative", op: "matches", value: "attention to file" }, r)).toBe(true);
    expect(evalCondition({ field: "narrative", op: "matches", value: "^draft" }, r)).toBe(false);
  });

  it("contains_any is a case-insensitive phrase match", () => {
    const r = entry("paralegal", { narrative: "Scanned and Bates-labeled production; Photocopying exhibits" });
    expect(evalCondition({ field: "narrative", op: "contains_any", value: ["photocopying", "binder"] }, r)).toBe(true);
    expect(evalCondition({ field: "narrative", op: "contains_any", value: ["word processing"] }, r)).toBe(false);
  });

  it("word_count_lt", () => {
    const short = entry("associate", { narrative: "Research issue" });
    const long = entry("associate", { narrative: "Research Delaware precedent on spoliation sanctions for motion" });
    expect(evalCondition({ field: "narrative", op: "word_count_lt", value: 5 }, short)).toBe(true);
    expect(evalCondition({ field: "narrative", op: "word_count_lt", value: 5 }, long)).toBe(false);
  });

  it("segment_count_gt", () => {
    const block = entry("associate", { narrative: "Draft motion to compel; review production and call opposing counsel" });
    const single = entry("associate", { narrative: "Draft motion to compel production of maintenance logs" });
    expect(evalCondition({ field: "narrative", op: "segment_count_gt", value: 1 }, block)).toBe(true);
    expect(evalCondition({ field: "narrative", op: "segment_count_gt", value: 1 }, single)).toBe(false);
  });

  it("not_multiple_of 0.1 (tenth-hour increments, float-safe)", () => {
    expect(evalCondition({ field: "hours", op: "not_multiple_of", value: 0.1 }, entry("partner", { hours: 0.25 }))).toBe(true);
    expect(evalCondition({ field: "hours", op: "not_multiple_of", value: 0.1 }, entry("partner", { hours: 0.3 }))).toBe(false);
    expect(evalCondition({ field: "hours", op: "not_multiple_of", value: 0.1 }, entry("partner", { hours: 1.7 }))).toBe(false);
    expect(evalCondition({ field: "hours", op: "not_multiple_of", value: 0.1 }, entry("partner", { hours: 2.4 }))).toBe(false);
  });

  it("gt_field / lt_field / not_in_field compare two fields", () => {
    const pet = { id: "p", offeredWage: 98000, lcaPrevailingWage: 104000, worksiteZip: "94105", lcaWorksiteZips: ["94105", "94107"] };
    expect(evalCondition({ field: "lcaPrevailingWage", op: "gt_field", value: "offeredWage" }, pet)).toBe(true);
    expect(evalCondition({ field: "offeredWage", op: "gt_field", value: "lcaPrevailingWage" }, pet)).toBe(false);
    expect(evalCondition({ field: "offeredWage", op: "lt_field", value: "lcaPrevailingWage" }, pet)).toBe(true);
    expect(evalCondition({ field: "lcaPrevailingWage", op: "lt_field", value: "offeredWage" }, pet)).toBe(false);
    expect(evalCondition({ field: "worksiteZip", op: "not_in_field", value: "lcaWorksiteZips" }, pet)).toBe(false);
    expect(evalCondition({ field: "worksiteZip", op: "not_in_field", value: "lcaWorksiteZips" }, { ...pet, worksiteZip: "10001" })).toBe(true);
  });
});

/* ───────────────────────────── nesting + when ───────────────────────────── */

describe("evalCondition: all / any / not nesting", () => {
  const r = entry("paralegal", { hours: 3, taskCode: "L140" });

  it("all requires every child", () => {
    expect(evalCondition({ all: [{ field: "role", op: "eq", value: "paralegal" }, { field: "hours", op: "gt", value: 2 }] }, r)).toBe(true);
    expect(evalCondition({ all: [{ field: "role", op: "eq", value: "paralegal" }, { field: "hours", op: "gt", value: 5 }] }, r)).toBe(false);
  });

  it("any requires one child", () => {
    expect(evalCondition({ any: [{ field: "role", op: "eq", value: "partner" }, { field: "taskCode", op: "eq", value: "L140" }] }, r)).toBe(true);
    expect(evalCondition({ any: [{ field: "role", op: "eq", value: "partner" }, { field: "taskCode", op: "eq", value: "L999" }] }, r)).toBe(false);
  });

  it("not inverts, and deep nesting composes", () => {
    expect(evalCondition({ not: { field: "role", op: "eq", value: "partner" } }, r)).toBe(true);
    const deep: Condition = {
      all: [
        { any: [{ field: "role", op: "eq", value: "associate" }, { field: "role", op: "eq", value: "paralegal" }] },
        { not: { field: "taskCode", op: "in", value: ["L110", "L120"] } },
      ],
    };
    expect(evalCondition(deep, r)).toBe(true);
    expect(evalCondition(deep, entry("partner", { taskCode: "L140" }))).toBe(false);
  });
});

describe("evaluateRule: entry rules", () => {
  it("`when` filters which records the rule applies to", () => {
    const rule = leafRule(
      { field: "hours", op: "gt", value: 2 },
      { when: { field: "role", op: "eq", value: "paralegal" } },
    );
    const recs = [
      entry("paralegal", { id: "a", hours: 3 }),
      entry("partner", { id: "b", hours: 3 }),
      entry("paralegal", { id: "c", hours: 1 }),
    ];
    expect(flagsOf(rule, recs)).toEqual(["a"]);
  });

  it("missing field ⇒ no flag (and no throw)", () => {
    const rule = leafRule({ field: "narrative", op: "word_count_lt", value: 5 });
    const rule2 = leafRule({ field: "hours", op: "gt", value: 1 });
    const recs = [{ id: "m1", role: "partner" }];
    expect(evaluateRule(rule, recs)).toEqual([]);
    expect(evaluateRule(rule2, recs)).toEqual([]);
  });

  it("flag carries ruleId, clauseId, entryId, severity, message", () => {
    const rule = leafRule({ field: "narrative", op: "segment_count_gt", value: 1 }, { severity: "reduce", message: "Block billing" });
    const recs = [entry("associate", { id: "blk", narrative: "Draft brief; call client" })];
    const [f] = evaluateRule(rule, recs);
    expect(f).toMatchObject({ ruleId: "rule_test__1", clauseId: "rb_test__1", entryId: "blk", severity: "reduce" });
    expect(typeof f.message).toBe("string");
    expect(f.message.length).toBeGreaterThan(0);
  });
});

/* ───────────────────────────── group rules ───────────────────────────── */

describe("evaluateRule: group rules", () => {
  const meetingRule: Rule = {
    id: "rule_rb_acme_ocg__4.2",
    clauseId: "rb_acme_ocg__4.2",
    title: "Max two attendees at internal conferences",
    severity: "reduce",
    scope: "group",
    recordType: "time_entry",
    when: { field: "activityCode", op: "eq", value: "A105" },
    violation: { groupBy: ["date", "activityCode"], fn: "count_distinct", field: "timekeeperId", op: "gt", value: 2 },
    message: "More than two timekeepers billed the same internal conference",
  };

  it("count_distinct timekeepers per date+activity > 2 flags every record in the group", () => {
    const recs = [
      entry("partner", { id: "m1", date: "2026-10-07", activityCode: "A105" }),
      entry("associate", { id: "m2", date: "2026-10-07", activityCode: "A105" }),
      entry("associate2", { id: "m3", date: "2026-10-07", activityCode: "A105" }),
      entry("paralegal", { id: "m4", date: "2026-10-07", activityCode: "A105" }),
      // two attendees on a different date — OK
      entry("partner", { id: "m5", date: "2026-10-08", activityCode: "A105" }),
      entry("associate", { id: "m6", date: "2026-10-08", activityCode: "A105" }),
      // same date, different activity — filtered out by when
      entry("associate2", { id: "x1", date: "2026-10-07", activityCode: "A104" }),
    ];
    expect(flagsOf(meetingRule, recs)).toEqual(["m1", "m2", "m3", "m4"]);
  });

  it("count_distinct counts distinct timekeepers, not rows", () => {
    const recs = [
      entry("partner", { id: "d1", date: "2026-10-09", activityCode: "A105" }),
      entry("partner", { id: "d2", date: "2026-10-09", activityCode: "A105" }),
      entry("associate", { id: "d3", date: "2026-10-09", activityCode: "A105" }),
    ];
    expect(evaluateRule(meetingRule, recs)).toEqual([]);
  });

  it("sum hours per date+timekeeper > 10 flags that day's entries only", () => {
    const rule: Rule = {
      ...meetingRule,
      id: "rule_rb_acme_ocg__5.1",
      clauseId: "rb_acme_ocg__5.1",
      when: undefined,
      severity: "warn",
      violation: { groupBy: ["date", "timekeeperId"], fn: "sum", field: "hours", op: "gt", value: 10 },
    };
    const recs = [
      entry("associate", { id: "h1", date: "2026-10-12", hours: 6 }),
      entry("associate", { id: "h2", date: "2026-10-12", hours: 5.5 }),
      entry("partner", { id: "h3", date: "2026-10-12", hours: 4 }),
      entry("associate", { id: "h4", date: "2026-10-13", hours: 10 }), // exactly 10 ⇒ OK
    ];
    expect(flagsOf(rule, recs)).toEqual(["h1", "h2"]);
  });

  it("count fn", () => {
    const rule: Rule = {
      ...meetingRule,
      when: undefined,
      violation: { groupBy: ["date", "timekeeperId"], fn: "count", field: "hours", op: "gte", value: 3 },
    };
    const recs = [
      entry("paralegal", { id: "c1", date: "2026-10-14" }),
      entry("paralegal", { id: "c2", date: "2026-10-14" }),
      entry("paralegal", { id: "c3", date: "2026-10-14" }),
      entry("paralegal", { id: "c4", date: "2026-10-15" }),
    ];
    expect(flagsOf(rule, recs)).toEqual(["c1", "c2", "c3"]);
  });
});

/* ───────────────────────────── impact ───────────────────────────── */

describe("computeImpact", () => {
  const r = entry("partner", { hours: 2, rate: 950, amount: 1900 });

  it("reject ⇒ full amount", () => {
    expect(computeImpact(leafRule({ field: "hours", op: "gt", value: 0 }, { severity: "reject" }), r)).toBe(1900);
  });

  it("reduce with rate_factor 0.5 ⇒ half", () => {
    const rule = leafRule({ field: "hours", op: "gt", value: 0 }, {
      severity: "reduce",
      adjustment: { type: "rate_factor", factor: 0.5 },
    });
    expect(computeImpact(rule, r)).toBe(950);
  });

  it("warn ⇒ 0", () => {
    expect(computeImpact(leafRule({ field: "hours", op: "gt", value: 0 }, { severity: "warn" }), r)).toBe(0);
  });

  it("falls back to hours × rate when amount missing; rounds to cents", () => {
    const rec = { id: "z", hours: 0.7, rate: 620 };
    expect(computeImpact(leafRule({ field: "hours", op: "gt", value: 0 }, { severity: "reject" }), rec)).toBeCloseTo(434, 2);
    const rule = leafRule({ field: "hours", op: "gt", value: 0 }, { severity: "reduce", adjustment: { type: "rate_factor", factor: 0.5 } });
    expect(computeImpact(rule, { id: "y", hours: 0.3, rate: 280 })).toBe(42);
  });

  it("flags from evaluateRule carry impactUsd", () => {
    const travel = leafRule(
      { field: "taskCode", op: "eq", value: "L999" },
      { severity: "reduce", adjustment: { type: "rate_factor", factor: 0.5 } },
    );
    const [f] = evaluateRule(travel, [entry("associate", { id: "tr", hours: 3, taskCode: "L999" })]);
    expect(f.impactUsd).toBe(930); // 3 × 620 × 0.5
  });
});

/* ───────────────────────────── runTests ───────────────────────────── */

describe("runTests", () => {
  const rule = leafRule({ field: "narrative", op: "segment_count_gt", value: 1 });

  it("reports pass/fail per test and auto-assigns ids", () => {
    const tests: RuleTest[] = [
      { name: "block billed", records: [{ narrative: "Draft brief; call client" }], expectFlagged: true },
      { name: "single task", records: [{ narrative: "Draft brief" }], expectFlagged: false },
      { name: "wrong expectation", records: [{ narrative: "Draft brief" }], expectFlagged: true },
    ];
    const res = runTests(rule, tests);
    expect(res).toEqual([
      { name: "block billed", expectFlagged: true, actualFlagged: true, passed: true },
      { name: "single task", expectFlagged: false, actualFlagged: false, passed: true },
      { name: "wrong expectation", expectFlagged: true, actualFlagged: false, passed: false },
    ]);
  });

  it("works for group rules on partial records", () => {
    const g: Rule = {
      ...rule,
      scope: "group",
      violation: { groupBy: ["date", "timekeeperId"], fn: "sum", field: "hours", op: "gt", value: 10 },
    };
    const res = runTests(g, [
      { name: "12h day", records: [{ date: "2026-10-01", timekeeperId: "TK-A07", hours: 7 }, { date: "2026-10-01", timekeeperId: "TK-A07", hours: 5 }], expectFlagged: true },
      { name: "8h day", records: [{ date: "2026-10-01", timekeeperId: "TK-A07", hours: 8 }], expectFlagged: false },
    ]);
    expect(res.map((t) => t.passed)).toEqual([true, true]);
  });
});

/* ───────────────────────────── checkRecords ───────────────────────────── */

describe("checkRecords", () => {
  it("runs all rules in stable order (records order, then rules order)", () => {
    const r1 = leafRule({ field: "hours", op: "not_multiple_of", value: 0.1 }, { id: "rule_a", clauseId: "c_a" });
    const r2 = leafRule({ field: "narrative", op: "word_count_lt", value: 4 }, { id: "rule_b", clauseId: "c_b" });
    const recs = [
      entry("associate", { id: "e1", hours: 0.25, narrative: "Research" }),
      entry("associate", { id: "e2", hours: 1.0, narrative: "Research Delaware spoliation precedent thoroughly" }),
      entry("partner", { id: "e3", hours: 0.33, narrative: "Call" }),
    ];
    const out = checkRecords([r1, r2], recs).map((f) => `${f.entryId}:${f.ruleId}`);
    expect(out).toEqual(["e1:rule_a", "e1:rule_b", "e3:rule_a", "e3:rule_b"]);
  });

  it("is deterministic: same input twice ⇒ deep-equal output", () => {
    const rules: Rule[] = [
      leafRule({ field: "narrative", op: "segment_count_gt", value: 1 }, { id: "rule_blk", severity: "reduce", adjustment: { type: "rate_factor", factor: 0.5 } }),
      {
        id: "rule_mtg", clauseId: "c_mtg", title: "Meetings", severity: "reject", scope: "group", recordType: "time_entry",
        violation: { groupBy: ["date", "activityCode"], fn: "count_distinct", field: "timekeeperId", op: "gt", value: 2 },
        message: "Too many attendees",
      },
    ];
    const recs = [
      entry("partner", { id: "q1", activityCode: "A105", narrative: "Strategy conference; review memo" }),
      entry("associate", { id: "q2", activityCode: "A105" }),
      entry("paralegal", { id: "q3", activityCode: "A105" }),
      entry("associate2", { id: "q4", activityCode: "A104", narrative: "Draft and file notice" }),
    ];
    const a = checkRecords(rules, recs);
    const b = checkRecords(rules, JSON.parse(JSON.stringify(recs)));
    expect(a.length).toBeGreaterThan(0);
    expect(b).toEqual(a);
  });
});

/* ───────────────────────────── H-1B ───────────────────────────── */

describe("H-1B rules", () => {
  const pet = (id: string, o: Record<string, unknown> = {}) => ({
    id,
    beneficiaryName: "Synthetic Beneficiary",
    employerName: "Acme Robotics LLC",
    offeredWage: 120000,
    lcaPrevailingWage: 110000,
    worksiteZip: "94105",
    lcaWorksiteZips: ["94105", "94107"],
    filingDate: "2026-06-01",
    requestedStartDate: "2026-10-01",
    ...o,
  });
  const h1b = (violation: Condition, id: string): Rule => ({
    id, clauseId: id.replace("rule_", ""), title: id, severity: "reject", scope: "entry",
    recordType: "h1b_petition", violation, message: "H-1B issue",
  });

  it("offeredWage lt_field lcaPrevailingWage", () => {
    const rule = h1b({ field: "offeredWage", op: "lt_field", value: "lcaPrevailingWage" }, "rule_w");
    expect(flagsOf(rule, [pet("ok"), pet("low", { offeredWage: 98000 }), pet("eq", { offeredWage: 110000 })])).toEqual(["low"]);
  });

  it("worksiteZip not_in_field lcaWorksiteZips", () => {
    const rule = h1b({ field: "worksiteZip", op: "not_in_field", value: "lcaWorksiteZips" }, "rule_z");
    expect(flagsOf(rule, [pet("ok"), pet("off", { worksiteZip: "10001" })])).toEqual(["off"]);
  });

  it("derived daysBeforeStart gt 180", () => {
    const rule = h1b({ field: "daysBeforeStart", op: "gt", value: 180 }, "rule_d");
    expect(flagsOf(rule, [pet("ok"), pet("early", { filingDate: "2026-01-02" })])).toEqual(["early"]);
  });
});
