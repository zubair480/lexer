// G1 — deterministic clause -> DSL compiler + automatic test generator.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { RecordType, Rule } from "@/shared/contract";
import { compileFromText } from "@/lib/compiler/patterns";
import { generateTests } from "@/lib/compiler/testgen";
import { segmentRulebook } from "@/lib/compiler/segment";
import { parseInvoiceCsv } from "@/lib/server/csv";
import { checkRecords, runTests, type EngineRecord } from "@/lib/engine";

const read = (f: string) => readFileSync(path.join(process.cwd(), "data", f), "utf8");

async function compileBook(file: string, rbId: string, rt: RecordType) {
  const clauses = await segmentRulebook(rbId, read(file));
  const out: Record<string, Rule | null> = {};
  for (const c of clauses) {
    const r = compileFromText({ number: c.number, title: c.title, text: c.text, id: c.id }, rt);
    out[c.number] = r ? r.rule : null;
  }
  return out;
}

function expectGoodTests(rule: Rule, rt: RecordType) {
  const tests = generateTests(rule, rt);
  const res = runTests(rule, tests);
  expect(res.every((r) => r.passed)).toBe(true);
  expect(tests.filter((t) => t.expectFlagged).length).toBeGreaterThanOrEqual(2);
  expect(tests.filter((t) => !t.expectFlagged).length).toBeGreaterThanOrEqual(2);
  return tests;
}

describe("compileFromText on the seeded rulebooks (text only, no reference rules)", () => {
  it("Acme 3.1–3.6 match golden.json on invoice-oct.csv; 3.7 is null", async () => {
    const rules = await compileBook("acme-ocg.md", "rb_acme_ocg", "time_entry");
    expect(rules["3.7"]).toBeNull();
    for (const n of ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6"]) {
      expect(rules[n], `clause ${n}`).not.toBeNull();
      expect(rules[n]!.message).toContain(`§${n}`);
      expectGoodTests(rules[n]!, "time_entry");
    }
    const active = Object.values(rules).filter(Boolean) as Rule[];
    const entries = parseInvoiceCsv(read("invoice-oct.csv"), "inv") as unknown as EngineRecord[];
    const flags = checkRecords(active, entries);
    const golden = JSON.parse(read("golden.json")) as Record<string, string[]>;
    let correct = 0;
    const mismatches: string[] = [];
    for (const [entryId, expected] of Object.entries(golden)) {
      const actual = Array.from(new Set(flags.filter((f) => f.entryId === entryId).map((f) => f.clauseId.split("__").pop()!))).sort();
      if (JSON.stringify(actual) === JSON.stringify([...expected].sort())) correct++;
      else mismatches.push(`${entryId}: expected ${expected} got ${actual}`);
    }
    expect(mismatches).toEqual([]);
    expect(correct).toBeGreaterThanOrEqual(14);
    // reduce rule carries the 50% factor
    expect(rules["3.4"]!.severity).toBe("reduce");
    expect(rules["3.4"]!.adjustment?.factor).toBe(0.5);
  });

  it("USCIS 4.1–4.3 flag only pet_02", async () => {
    const rules = await compileBook("uscis-h1b.md", "rb_uscis_h1b", "h1b_petition");
    for (const n of ["4.1", "4.2", "4.3"]) {
      expect(rules[n], `clause ${n}`).not.toBeNull();
      expectGoodTests(rules[n]!, "h1b_petition");
    }
    const pets = JSON.parse(read("petitions.json")) as EngineRecord[];
    const flags = checkRecords(Object.values(rules).filter(Boolean) as Rule[], pets);
    expect(Array.from(new Set(flags.map((f) => f.entryId)))).toEqual(["pet_02"]);
  });
});

describe("unseen clauses", () => {
  const cases: Array<{ text: string; check: (r: Rule) => void }> = [
    {
      text: "Time must be billed in tenth-of-an-hour increments.",
      check: (r) => expect(r.violation).toEqual({ field: "hours", op: "not_multiple_of", value: 0.1 }),
    },
    {
      text: "Partner rates may not exceed $900 per hour.",
      check: (r) => {
        expect(r.when).toEqual({ field: "role", op: "eq", value: "partner" });
        expect(r.violation).toEqual({ field: "rate", op: "gt", value: 900 });
      },
    },
    {
      text: "No more than 8 hours of research per day per timekeeper.",
      check: (r) => {
        expect(r.scope).toBe("group");
        expect(r.violation).toMatchObject({ fn: "sum", field: "hours", op: "gt", value: 8, groupBy: ["timekeeperId", "date"] });
        expect(JSON.stringify(r.when)).toContain("A102");
      },
    },
    {
      text: "Internal conferences between firm attorneys are not billable.",
      check: (r) => {
        expect(r.severity).toBe("reject");
        expect(JSON.stringify(r.violation)).toContain("A105");
      },
    },
    {
      text: "Overtime for secretarial staff is not reimbursable.",
      check: (r) => {
        expect(r.severity).toBe("reject");
        expect(JSON.stringify(r.violation)).toContain("overtime");
      },
    },
    {
      text: "Entries must not exceed 12 hours.",
      check: (r) => expect(r.violation).toEqual({ field: "hours", op: "gt", value: 12 }),
    },
    {
      text: "No more than three attorneys may bill for attending the same hearing on the same day.",
      check: (r) => expect(r.violation).toMatchObject({ fn: "count_distinct", field: "timekeeperId", value: 3 }),
    },
    {
      text: "Local travel is billed at 75 percent of the standard hourly rate.",
      check: (r) => {
        expect(r.severity).toBe("reduce");
        expect(r.adjustment?.factor).toBe(0.75);
      },
    },
    {
      text: "Narratives with fewer than 7 words will be flagged.",
      check: (r) => expect(r.violation).toEqual({ field: "narrative", op: "word_count_lt", value: 7 }),
    },
  ];
  cases.forEach(({ text, check }, i) => {
    it(`compiles + self-tests: ${text}`, () => {
      const res = compileFromText({ number: `9.${i + 1}`, title: "Unseen", text, id: `rb_x__9.${i + 1}` }, "time_entry");
      expect(res, text).not.toBeNull();
      expect(res!.rule.message).toContain(`§9.${i + 1}`);
      check(res!.rule);
      expectGoodTests(res!.rule, "time_entry");
    });
  });

  it("returns null for judgment / unrecognised clauses", () => {
    for (const text of [
      "All time billed must be reasonable and necessary to the representation.",
      "Counsel should use appropriate staffing levels.",
      "Invoices must be submitted monthly.",
      "Counsel will cooperate with Acme's in-house team.",
    ]) {
      expect(compileFromText({ number: "9.9", title: "x", text }, "time_entry"), text).toBeNull();
    }
  });
});

describe("offline wiring: compileClause for clauses without a reference rule", () => {
  it("unseen clause compiles to verified with generated tests; judgment clause ends uncertain; seeded 3.2 still repairs", async () => {
    const prevMode = process.env.LLM_MODE;
    const prevDelay = process.env.LLM_OFFLINE_DELAY_MS;
    process.env.LLM_MODE = "offline";
    process.env.LLM_OFFLINE_DELAY_MS = "0";
    try {
      const { compileClause } = await import("@/lib/compiler/compile");
      const { resetOfflineState } = await import("@/lib/server/offline");
      resetOfflineState();
      const mk = (number: string, title: string, text: string) => ({
        id: `rb_new__${number}`, rulebookId: "rb_new", number, title, text, start: 0, end: text.length,
      });
      const ok = await compileClause(mk("2.1", "Rate cap", "Partner rates may not exceed $900 per hour."), "time_entry");
      expect(ok.status).toBe("verified");
      expect(ok.rule?.id).toBe("rule_rb_new__2.1");
      expect(ok.testResults.every((r) => r.passed)).toBe(true);
      // A new rulebook re-using number 3.1 must NOT get Acme's block-billing reference rule.
      const renum = await compileClause(mk("3.1", "Daily cap", "Entries must not exceed 12 hours."), "time_entry");
      expect(renum.status).toBe("verified");
      expect(renum.rule?.violation).toEqual({ field: "hours", op: "gt", value: 12 });
      const judg = await compileClause(mk("2.2", "Reasonableness", "Staffing must be reasonable."), "time_entry");
      expect(judg.status).toBe("uncertain");
      const acme = await segmentRulebook("rb_acme_ocg", read("acme-ocg.md"));
      const c32 = acme.find((c) => c.number === "3.2")!;
      const seeded = await compileClause(c32, "time_entry");
      expect(seeded.status).toBe("verified");
      expect(seeded.attempts).toBe(2);
    } finally {
      if (prevMode === undefined) delete process.env.LLM_MODE; else process.env.LLM_MODE = prevMode;
      if (prevDelay === undefined) delete process.env.LLM_OFFLINE_DELAY_MS; else process.env.LLM_OFFLINE_DELAY_MS = prevDelay;
    }
  });
});
