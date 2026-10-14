// B14 — offline (no API key) mode: deterministic compile / repair / classify / suggest.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Clause, RecordType } from "@/shared/contract";
import { offlineRespond, resetOfflineState, distributeHours } from "@/lib/server/offline";
import { setLlmOverride } from "@/lib/server/llm";
import { runTests } from "@/lib/engine";
import { CompileOutputSchema } from "@/lib/compiler/schemas";
import { normalizeRule, normalizeTests } from "@/lib/compiler/normalize";
import { buildCompileSystem, buildCompileUser } from "@/lib/compiler/prompts";
import { segmentRulebook } from "@/lib/compiler/segment";
import { compileClause } from "@/lib/compiler/compile";
import { classifyClause } from "@/lib/compiler/classify";

const ENV_KEYS = ["LLM_MODE", "LLM_OFFLINE_DELAY_MS"] as const;
const saved: Record<string, string | undefined> = {};

let acme: Clause[] = [];
let uscis: Clause[] = [];

function read(file: string): string {
  return readFileSync(path.join(process.cwd(), "data", file), "utf8");
}

function byNum(num: string): { clause: Clause; rt: RecordType } {
  const a = acme.find((c) => c.number === num);
  if (a) return { clause: a, rt: "time_entry" };
  const u = uscis.find((c) => c.number === num);
  if (u) return { clause: u, rt: "h1b_petition" };
  throw new Error(`clause ${num} not found`);
}

async function offlineCompile(num: string) {
  const { clause, rt } = byNum(num);
  const raw = await offlineRespond({
    name: "compile_rule",
    system: buildCompileSystem(rt),
    user: buildCompileUser(clause, rt),
  });
  const parsed = CompileOutputSchema.parse(raw);
  const rule = normalizeRule(parsed.rule, clause, rt);
  const tests = normalizeTests(parsed.tests);
  return { rule, tests, results: runTests(rule, tests) };
}

beforeAll(async () => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.LLM_MODE = "offline";
  process.env.LLM_OFFLINE_DELAY_MS = "0";
  setLlmOverride(null);
  acme = await segmentRulebook("rb_acme_ocg", read("acme-ocg.md"));
  uscis = await segmentRulebook("rb_uscis_h1b", read("uscis-h1b.md"));
});

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetOfflineState();
});

beforeEach(() => resetOfflineState());

describe("offline compile_rule", () => {
  const NUMS = ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "4.1", "4.2", "4.3"];

  it.each(NUMS)("clause %s: output passes zod and all tests pass (>=2 true, >=2 false)", async (num) => {
    let out = await offlineCompile(num);
    if (num === "3.2") {
      // first compile of 3.2 is the deliberate demo flaw
      expect(out.results.some((r) => !r.passed)).toBe(true);
      out = await offlineCompile(num); // within the 60s window => correct rule
    }
    expect(out.results.length).toBeGreaterThanOrEqual(4);
    expect(out.results.filter((r) => !r.passed)).toEqual([]);
    expect(out.tests.filter((t) => t.expectFlagged).length).toBeGreaterThanOrEqual(2);
    expect(out.tests.filter((t) => !t.expectFlagged).length).toBeGreaterThanOrEqual(2);
    if (out.rule.scope === "group") {
      for (const t of out.tests) expect(t.records.length).toBeGreaterThan(1);
    }
  });

  it("compileClause on 3.2 repairs and ends verified with attempts >= 2", async () => {
    const { clause, rt } = byNum("3.2");
    const statuses: string[] = [];
    const res = await compileClause(clause, rt, (p) => {
      if (p.kind === "status") statuses.push(p.status);
    });
    expect(res.status).toBe("verified");
    expect(res.attempts).toBeGreaterThanOrEqual(2);
    expect(statuses).toContain("repairing");
    expect(res.rule?.id).toBe(`rule_${clause.id}`);
  });

  it("compileClause on every other clause verifies on attempt 1", async () => {
    for (const num of ["3.1", "3.3", "3.4", "3.5", "3.6", "4.1", "4.2", "4.3"]) {
      const { clause, rt } = byNum(num);
      const res = await compileClause(clause, rt);
      expect(res.status, num).toBe("verified");
      expect(res.attempts, num).toBe(1);
    }
  });

  it("unknown name throws", async () => {
    await expect(offlineRespond({ name: "nope", system: "", user: "" })).rejects.toThrow(/offline: no handler for nope/);
  });
});

describe("offline classify_clause", () => {
  it("3.7 is judgment; 3.1–3.6 and 4.x are compilable", async () => {
    const { clause, rt } = byNum("3.7");
    const r = await classifyClause(clause, rt);
    expect(r.kind).toBe("judgment");
    expect(r.reason).toMatch(/reasonable/i);
    for (const num of ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "4.1", "4.2", "4.3"]) {
      const c = byNum(num);
      const out = await classifyClause(c.clause, c.rt);
      expect(out.kind, num).toBe("compilable");
      expect(out.reason.length).toBeGreaterThan(20);
    }
  });
});

describe("offline suggest_fix", () => {
  const userFor = (num: string, title: string, entry: Record<string, unknown>) =>
    [`GUIDELINE CLAUSE ${num} — ${title}:`, "text", "", `VIOLATION (reject): ${title} — msg`, "", "TIME ENTRY:", JSON.stringify(entry, null, 2)].join("\n");

  it("block billing splits into single tasks whose hours sum exactly", async () => {
    const out = (await offlineRespond({
      name: "suggest_fix",
      system: "",
      user: userFor("3.1", "Block billing", {
        hours: 3.2, taskCode: "L350", activityCode: "A103",
        narrative: "Drafted motion to compel; reviewed opposing production; conferred with client regarding discovery",
      }),
    })) as { splitEntries: { hours: number; narrative: string }[] };
    expect(out.splitEntries).toHaveLength(3);
    const sum = Math.round(out.splitEntries.reduce((a, s) => a + s.hours, 0) * 10) / 10;
    expect(sum).toBe(3.2);
    for (const s of out.splitEntries) expect(s.narrative.split(/\s+/).length).toBeGreaterThanOrEqual(5);
  });

  it("vague narrative gets a specific rewrite; other clauses explanation only", async () => {
    const v = (await offlineRespond({
      name: "suggest_fix", system: "",
      user: userFor("3.2", "Vague narratives", { hours: 0.8, taskCode: "L120", narrative: "Attention to file" }),
    })) as { narrative: string };
    expect(v.narrative).toMatch(/case file/i);
    const t = (await offlineRespond({
      name: "suggest_fix", system: "",
      user: userFor("3.4", "Travel", { hours: 4, taskCode: "L120", narrative: "Non-working travel to Denver" }),
    })) as { narrative?: string; splitEntries?: unknown; explanation: string };
    expect(t.narrative).toBeUndefined();
    expect(t.splitEntries).toBeUndefined();
    expect(t.explanation).toMatch(/50%/);
  });

  it("distributeHours sums exactly in 0.1 steps", () => {
    for (const [h, n] of [[3.2, 3], [1.0, 3], [0.2, 3], [2.5, 2], [7.9, 4]] as const) {
      const parts = distributeHours(h, n);
      expect(Math.round(parts.reduce((a, b) => a + b, 0) * 10) / 10).toBe(h);
      for (const p of parts) expect(Math.round(p * 10)).toBeCloseTo(p * 10, 6);
    }
  });
});
