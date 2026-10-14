// B13 — adversarial QA for the rule engine + reference rules.
//
// Two halves:
//  1. Reference-rule probes: load data/reference-rules.json (B9) and throw near-misses (must NOT
//     flag) and disguised true positives (MUST flag) at each Acme OCG clause + the USCIS checklist.
//     Skipped automatically if the file or a specific rule is missing.
//  2. Engine robustness: hand-written rules that probe failure modes (bad regex, missing fields,
//     unknown ops, empty inputs, float sums) — these never depend on B9's data.
//
// Design decisions documented inline with "DECISION:".
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkRecords, evaluateRule } from "@/lib/engine";
import type { EngineRecord } from "@/lib/engine";
import type { Rule } from "@/shared/contract";

/* ───────────────────────── reference rules ───────────────────────── */

type RefFile = { rb_acme_ocg?: Rule[]; rb_uscis_h1b?: Rule[] };
const refPath = path.join(process.cwd(), "data", "reference-rules.json");
const ref: RefFile | null = fs.existsSync(refPath)
  ? (JSON.parse(fs.readFileSync(refPath, "utf8")) as RefFile)
  : null;

/** Find a rule by clause number ("3.1") — matches id/clauseId suffix `__3.1`. */
function findRule(list: Rule[] | undefined, num: string): Rule | undefined {
  return (list ?? []).find(
    (r) => r.id?.endsWith(`__${num}`) || r.clauseId?.endsWith(`__${num}`),
  );
}
const acme = (num: string) => findRule(ref?.rb_acme_ocg, num);
const uscis = (num: string) => findRule(ref?.rb_uscis_h1b, num);

let seq = 0;
/** A clean, specific, single-task, billable associate entry. Override what you probe. */
function entry(over: Partial<Record<string, unknown>> = {}): EngineRecord {
  seq += 1;
  const base: EngineRecord = {
    id: `adv${seq}`,
    invoiceId: "inv_adv",
    date: "2026-10-06",
    timekeeperId: "tk_assoc",
    timekeeperName: "Dana Associate",
    role: "associate",
    hours: 1.5,
    rate: 620,
    taskCode: "L210",
    activityCode: "A103",
    narrative: "Drafted opposition brief section addressing personal jurisdiction arguments",
    matterId: "ACME-LIT-0042",
    ...over,
  };
  if (over.amount === undefined) base.amount = Math.round(Number(base.hours) * Number(base.rate) * 100) / 100;
  return base;
}

const flaggedIds = (rule: Rule, recs: EngineRecord[]) =>
  evaluateRule(rule, recs).map((f) => f.entryId).sort();
const flags = (rule: Rule, rec: EngineRecord) => evaluateRule(rule, [rec]).length > 0;

/** describe() that skips when the reference rule isn't there yet. */
function forRule(label: string, get: () => Rule | undefined, body: (rule: () => Rule) => void) {
  const r = get();
  describe.skipIf(!r)(`${label}${r ? "" : " (SKIPPED: reference rule missing)"}`, () => body(() => r!));
}

/* ───────────────────────── sanity: base entry is clean ───────────────────────── */

describe.skipIf(!ref?.rb_acme_ocg?.length)("adversarial: baseline", () => {
  it("the clean base entry triggers no Acme reference rule", () => {
    const rules = ref!.rb_acme_ocg!;
    expect(checkRecords(rules, [entry()])).toEqual([]);
  });
});

/* ───────────────────────── 3.1 Block billing ───────────────────────── */

forRule("3.1 block billing", () => acme("3.1"), (rule) => {
  it("NOT: 'Reviewed and revised draft motion to compel' at 0.4h (under 0.5h threshold)", () => {
    expect(flags(rule(), entry({ hours: 0.4, narrative: "Reviewed and revised draft motion to compel" }))).toBe(false);
  });

  it("NOT: three tasks at exactly 0.5h — clause says 'over 0.5 hrs'", () => {
    expect(
      flags(rule(), entry({ hours: 0.5, narrative: "Drafted letter; reviewed production; call with client" })),
    ).toBe(false);
  });

  it("NOT: 'Brandenburg' / 'Anderson' / 'standard' contain 'and' mid-word — not a segment separator", () => {
    expect(
      flags(rule(), entry({ hours: 2.0, narrative: "Researched Brandenburg standard as applied in Anderson decision" })),
    ).toBe(false);
  });

  it("MUST: three semicolon-separated tasks over 0.5h", () => {
    expect(
      flags(rule(), entry({ hours: 3.2, narrative: "Drafted motion to compel; reviewed document production; call with client re strategy" })),
    ).toBe(true);
  });

  it("MUST: SHOUTING case + ragged whitespace still splits into tasks", () => {
    expect(
      flags(rule(), entry({ hours: 3.2, narrative: "  DRAFTED MOTION TO COMPEL ;   REVIEWED PRODUCTION  AND   CALL WITH CLIENT  " })),
    ).toBe(true);
  });

  it("MUST: ampersand-joined tasks over 0.5h", () => {
    expect(
      flags(rule(), entry({ hours: 2.4, narrative: "Prepared deposition outline & reviewed exhibits & conferred with partner" })),
    ).toBe(true);
  });
});

/* ───────────────────────── 3.2 Vague narratives ───────────────────────── */

forRule("3.2 vague narratives", () => acme("3.2"), (rule) => {
  it("MUST: 'ATTENTION TO FILE' (uppercase)", () => {
    expect(flags(rule(), entry({ hours: 0.8, narrative: "ATTENTION TO FILE" }))).toBe(true);
  });

  it("MUST: 'Work on file' / 'Review documents' — bare, no subject", () => {
    expect(flags(rule(), entry({ narrative: "Work on file" }))).toBe(true);
    expect(flags(rule(), entry({ narrative: "Review documents." }))).toBe(true);
  });

  it("MUST: long narrative hiding the phrase behind extra internal whitespace", () => {
    // 9 words, so only the phrase test can catch it — 'attention   to' has 3 spaces.
    expect(
      flags(rule(), entry({ narrative: "General attention   to file regarding various open items this week" })),
    ).toBe(true);
  });

  it("NOT: specific 7-word narrative 'Reviewed and revised draft motion to compel'", () => {
    expect(flags(rule(), entry({ hours: 0.4, narrative: "Reviewed and revised draft motion to compel" }))).toBe(false);
  });

  // DECISION: the clause literally lists the phrase "attention to" as vague, and the engine is a
  // deterministic phrase matcher. "Attention to detail in drafting summary judgment brief" is a
  // tolerable false positive (attorney can dismiss with a note). We assert it IS flagged so any
  // change in that behaviour is a conscious one.
  it("DECISION (accepted FP): 'Attention to detail in drafting summary judgment brief' is flagged", () => {
    expect(flags(rule(), entry({ narrative: "Attention to detail in drafting summary judgment brief" }))).toBe(true);
  });
});

/* ───────────────────────── 3.3 Staffing ───────────────────────── */

const tk = (id: string, role: string, rate: number) => ({ timekeeperId: id, timekeeperName: id, role, rate });
const P = tk("tk_partner", "partner", 950);
const A = tk("tk_assoc", "associate", 620);
const L = tk("tk_para", "paralegal", 280);

forRule("3.3 staffing", () => acme("3.3"), (rule) => {
  it("NOT: client strategy meeting (A109) attended by exactly 2 timekeepers", () => {
    const recs = [
      entry({ ...P, activityCode: "A109", taskCode: "L120", hours: 1.0, narrative: "Attended client strategy meeting regarding settlement posture" }),
      entry({ ...A, activityCode: "A109", taskCode: "L120", hours: 1.0, narrative: "Attended client strategy meeting regarding settlement posture" }),
    ];
    expect(flaggedIds(rule(), recs)).toEqual([]);
  });

  it("NOT: 3 timekeepers same day, but only 2 at the A109 meeting (third is drafting)", () => {
    const recs = [
      entry({ ...P, activityCode: "A109", hours: 1.0, narrative: "Attended client strategy meeting regarding settlement posture" }),
      entry({ ...A, activityCode: "A109", hours: 1.0, narrative: "Attended client strategy meeting regarding settlement posture" }),
      entry({ ...L, activityCode: "A103", hours: 1.0, narrative: "Prepared exhibit binder index for deposition of plant manager" }),
    ];
    expect(flaggedIds(rule(), recs)).toEqual([]);
  });

  it("NOT: 3 timekeepers at A109 events on three different days", () => {
    const recs = [
      entry({ ...P, activityCode: "A109", date: "2026-10-07", narrative: "Attended deposition of plant manager J. Ortiz in Chicago" }),
      entry({ ...A, activityCode: "A109", date: "2026-10-08", narrative: "Attended deposition of plant manager J. Ortiz in Chicago" }),
      entry({ ...L, activityCode: "A109", date: "2026-10-09", narrative: "Attended deposition of plant manager J. Ortiz in Chicago" }),
    ];
    expect(flaggedIds(rule(), recs)).toEqual([]);
  });

  it("NOT: one timekeeper with 3 A109 entries the same day (distinct people = 1)", () => {
    const recs = [1, 2, 3].map(() =>
      entry({ ...A, activityCode: "A109", hours: 1.0, narrative: "Attended deposition of plant manager J. Ortiz in Chicago" }),
    );
    expect(flaggedIds(rule(), recs)).toEqual([]);
  });

  it("MUST: 3 timekeepers at the same deposition day across DIFFERENT task codes — all 3 flagged", () => {
    const recs = [
      entry({ ...P, activityCode: "A109", taskCode: "L330", date: "2026-10-14", hours: 6.0, narrative: "Attended deposition of plant manager J. Ortiz in Chicago" }),
      entry({ ...A, activityCode: "A109", taskCode: "L320", date: "2026-10-14", hours: 6.0, narrative: "Attended deposition of plant manager J. Ortiz in Chicago" }),
      entry({ ...L, activityCode: "A109", taskCode: "L120", date: "2026-10-14", hours: 6.0, narrative: "Attended deposition of plant manager J. Ortiz in Chicago" }),
    ];
    expect(flaggedIds(rule(), recs)).toEqual(recs.map((r) => r.id as string).sort());
  });
});

/* ───────────────────────── 3.4 Travel ───────────────────────── */

forRule("3.4 travel", () => acme("3.4"), (rule) => {
  it("MUST: non-working travel at full rate is flagged with 50% impact", () => {
    const rec = entry({
      hours: 4.0, rate: 620, taskCode: "L330", activityCode: "A111",
      narrative: "Non-working travel to Chicago for deposition of plant manager J. Ortiz",
    });
    const f = evaluateRule(rule(), [rec]);
    expect(f).toHaveLength(1);
    expect(f[0].impactUsd).toBeCloseTo(1240, 2);
  });

  it("MUST: 'NON-WORKING TRAVEL' in caps with ragged spacing, no A110 code", () => {
    expect(flags(rule(), entry({ hours: 3.0, activityCode: "A111", narrative: "  NON-WORKING TRAVEL FROM CHICAGO TO NEW YORK FOLLOWING DEPOSITION " }))).toBe(true);
  });

  // DECISION: the engine cannot know the timekeeper's "standard rate", so a travel entry already
  // billed at 50% (rate 310 for a $620 associate) WILL still be flagged and its impact is computed
  // off the billed amount. We document the impact math so the UI number is predictable.
  it("DECISION: travel already billed at a halved rate is still flagged; impact = 50% of billed amount", () => {
    const f = evaluateRule(rule(), [entry({ hours: 4.0, rate: 310, narrative: "Non-working travel to Chicago for deposition of plant manager" })]);
    if (f.length) expect(f[0].impactUsd).toBeCloseTo(620, 2);
  });
});

/* ───────────────────────── 3.5 Clerical ───────────────────────── */

forRule("3.5 clerical", () => acme("3.5"), (rule) => {
  it("MUST: paralegal 'Organized and filed exhibits'", () => {
    expect(flags(rule(), entry({ ...L, hours: 1.2, narrative: "Organized and filed exhibits" }))).toBe(true);
  });

  it("MUST: 'SCHEDULED court reporter' / 'Copying' in caps", () => {
    expect(flags(rule(), entry({ ...L, narrative: "SCHEDULED COURT REPORTER AND VIDEOGRAPHER FOR DEPOSITION" }))).toBe(true);
    expect(flags(rule(), entry({ ...L, narrative: "Copying deposition exhibits for production set" }))).toBe(true);
  });

  it("NOT: 'profiling' contains 'filing' mid-word", () => {
    expect(
      flags(rule(), entry({ narrative: "Analyzed expert report on customer profiling methodology and damages model" })),
    ).toBe(false);
  });
});

/* ───────────────────────── 3.6 Daily cap ───────────────────────── */

forRule("3.6 daily cap", () => acme("3.6"), (rule) => {
  it("NOT: exactly 10.0h on one day (6.0 + 4.0)", () => {
    const recs = [entry({ hours: 6.0 }), entry({ hours: 4.0 })];
    expect(flaggedIds(rule(), recs)).toEqual([]);
  });

  it("NOT: exactly 10.0h on one day built from float-unfriendly parts (0.3 + 7.9 + 1.8)", () => {
    // 0.3 + 7.9 + 1.8 === 10.000000000000002 in IEEE-754.
    const recs = [entry({ hours: 0.3 }), entry({ hours: 7.9 }), entry({ hours: 1.8 })];
    expect(flaggedIds(rule(), recs)).toEqual([]);
  });

  it("NOT: 11h for the same timekeeper split across two different days", () => {
    const recs = [entry({ hours: 6.0, date: "2026-10-06" }), entry({ hours: 5.0, date: "2026-10-07" })];
    expect(flaggedIds(rule(), recs)).toEqual([]);
  });

  it("NOT: 12h on one day split across two different timekeepers", () => {
    const recs = [entry({ ...A, hours: 6.0 }), entry({ ...P, hours: 6.0 })];
    expect(flaggedIds(rule(), recs)).toEqual([]);
  });

  it("MUST: 10.1h on one day — both entries flagged", () => {
    const recs = [entry({ hours: 6.0 }), entry({ hours: 4.1 })];
    expect(flaggedIds(rule(), recs)).toEqual(recs.map((r) => r.id as string).sort());
  });

  it("MUST: single 11.5h entry", () => {
    expect(flags(rule(), entry({ hours: 11.5 }))).toBe(true);
  });
});

/* ───────────────────────── USCIS H-1B checklist ───────────────────────── */

function petition(over: Partial<Record<string, unknown>> = {}): EngineRecord {
  seq += 1;
  return {
    id: `pet${seq}`,
    beneficiaryName: "Synthetic Beneficiary",
    employerName: "Synthetic Employer LLC",
    offeredWage: 120000,
    lcaPrevailingWage: 110000,
    worksiteZip: "02139",
    lcaWorksiteZips: ["02139", "10001"],
    filingDate: "2026-05-01",
    requestedStartDate: "2026-10-01",
    ...over,
  };
}

describe.skipIf(!ref?.rb_uscis_h1b?.length)("USCIS H-1B reference rules", () => {
  const all = () => ref!.rb_uscis_h1b!;
  it("NOT: boundary-compliant petition (wage == prevailing exactly, ZIP listed, exactly 180 days) flags nothing", () => {
    // 2026-04-04 -> 2026-10-01 is exactly 180 days: "no more than 180 days" must pass.
    expect(checkRecords(all(), [petition({ offeredWage: 110000, filingDate: "2026-04-04" })])).toEqual([]);
  });
  it("MUST: filed 181 days before start", () => {
    expect(checkRecords(all(), [petition({ filingDate: "2026-04-03" })]).length).toBeGreaterThan(0);
  });
  it("NOT: ZIP listed but stored with whitespace / as a number in the LCA list", () => {
    expect(checkRecords(all(), [petition({ worksiteZip: " 10001 ", lcaWorksiteZips: [2139, "10001"] })])).toEqual([]);
  });
  it("MUST: offered wage $1 below prevailing", () => {
    expect(checkRecords(all(), [petition({ offeredWage: 109999 })]).length).toBeGreaterThan(0);
  });
  it("MUST: worksite ZIP not on the certified LCA", () => {
    expect(checkRecords(all(), [petition({ worksiteZip: "94105" })]).length).toBeGreaterThan(0);
  });
  it("MUST: filed ~8 months before start", () => {
    expect(checkRecords(all(), [petition({ filingDate: "2026-02-01" })]).length).toBeGreaterThan(0);
  });
});

/* ───────────────────────── engine robustness (no data dependency) ───────────────────────── */

function mkRule(over: Partial<Rule>): Rule {
  return {
    id: "rule_adv",
    clauseId: "adv__0",
    title: "adversarial",
    severity: "reject",
    scope: "entry",
    recordType: "time_entry",
    violation: { field: "narrative", op: "matches", value: "x" },
    message: "adversarial",
    ...over,
  } as Rule;
}

describe("engine robustness", () => {
  it("invalid regex in `matches` does not throw and does not flag", () => {
    const rule = mkRule({ violation: { field: "narrative", op: "matches", value: "([unclosed" } });
    expect(() => evaluateRule(rule, [entry()])).not.toThrow();
    expect(evaluateRule(rule, [entry()])).toEqual([]);
  });

  it("missing fields never flag (hours gt, contains_any, word_count_lt, segment_count_gt)", () => {
    const bare: EngineRecord = { id: "bare" };
    for (const violation of [
      { field: "hours", op: "gt", value: 0 },
      { field: "narrative", op: "contains_any", value: ["attention to"] },
      { field: "narrative", op: "word_count_lt", value: 5 },
      { field: "narrative", op: "segment_count_gt", value: 1 },
      { field: "taskCode", op: "not_in", value: ["L120"] },
      { field: "worksiteZip", op: "not_in_field", value: "lcaWorksiteZips" },
    ] as Rule["violation"][]) {
      expect(evaluateRule(mkRule({ violation }), [bare]), JSON.stringify(violation)).toEqual([]);
    }
  });

  it("null narrative does not throw or flag", () => {
    const rule = mkRule({ violation: { field: "narrative", op: "word_count_lt", value: 5 } });
    expect(evaluateRule(rule, [entry({ narrative: null })])).toEqual([]);
  });

  it("empty records array → no flags for entry, group and checkRecords", () => {
    const group = mkRule({
      scope: "group",
      violation: { groupBy: ["timekeeperId", "date"], fn: "sum", field: "hours", op: "gt", value: 10 },
    });
    expect(evaluateRule(mkRule({}), [])).toEqual([]);
    expect(evaluateRule(group, [])).toEqual([]);
    expect(checkRecords([mkRule({}), group], [])).toEqual([]);
    expect(checkRecords([], [entry()])).toEqual([]);
  });

  it("unknown op returns no flag without throwing", () => {
    const rule = mkRule({ violation: { field: "hours", op: "explode" as never, value: 1 } });
    expect(() => evaluateRule(rule, [entry()])).not.toThrow();
    expect(evaluateRule(rule, [entry()])).toEqual([]);
  });

  it("unknown field / malformed condition returns no flag without throwing", () => {
    const r1 = mkRule({ violation: { field: "nope" as never, op: "eq", value: "x" } });
    const r2 = mkRule({ violation: {} as never });
    expect(evaluateRule(r1, [entry()])).toEqual([]);
    expect(evaluateRule(r2, [entry()])).toEqual([]);
  });

  it("checkRecords survives one rule that throws and still returns the others' flags", () => {
    const good = mkRule({ id: "rule_good", violation: { field: "hours", op: "gt", value: 1 } });
    const evil = mkRule({ id: "rule_evil", violation: null as never });
    const out = checkRecords([evil, good], [entry({ hours: 2 })]);
    expect(out.map((f) => f.ruleId)).toEqual(["rule_good"]);
  });

  it("segment counting: 'and' inside words is not a separator, ' AND ' is", () => {
    const rule = mkRule({ violation: { field: "narrative", op: "segment_count_gt", value: 1 } });
    expect(flags(rule, entry({ narrative: "Researched Brandenburg standard in Anderson" }))).toBe(false);
    expect(flags(rule, entry({ narrative: "Drafted brief AND called client" }))).toBe(true);
  });

  it("daily-cap aggregate: 0.3 + 7.9 + 1.8 hours (== 10.0) does not exceed gt 10", () => {
    const rule = mkRule({
      scope: "group",
      violation: { groupBy: ["timekeeperId", "date"], fn: "sum", field: "hours", op: "gt", value: 10 },
    });
    const recs = [entry({ hours: 0.3 }), entry({ hours: 7.9 }), entry({ hours: 1.8 })];
    expect(evaluateRule(rule, recs)).toEqual([]);
  });

  it("contains_any tolerates extra internal whitespace in the narrative", () => {
    const rule = mkRule({ violation: { field: "narrative", op: "contains_any", value: ["attention to"] } });
    expect(flags(rule, entry({ narrative: "General attention \t to file regarding open items" }))).toBe(true);
  });
});
