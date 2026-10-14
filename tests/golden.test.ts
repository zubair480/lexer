/**
 * B12 — Golden-set conformance (offline, no DB, no LLM).
 * Reference rules (data/reference-rules.json, B9) + invoice-oct.csv (B10 parser) + golden.json
 * run through the pure engine must reproduce the hand labels.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { checkRecords, runTests } from "@/lib/engine";
import { parseInvoiceCsv } from "@/lib/server/csv";
import type { Rule, TimeEntry } from "@/shared/contract";
import { DEMO } from "@/shared/contract";

const DATA = path.join(process.cwd(), "data");
const readJson = (f: string) => JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"));

/** Accepts Rule[], CompiledRule[] ({dsl}), {rules:[...]}, or {<rulebookId>: Rule[]}. */
function normalizeRules(raw: unknown): Rule[] {
  const out: Rule[] = [];
  const visit = (x: unknown): void => {
    if (!x || typeof x !== "object") return;
    if (Array.isArray(x)) return x.forEach(visit);
    const o = x as Record<string, unknown>;
    if (o.dsl && typeof o.dsl === "object") return visit(o.dsl);
    if ("violation" in o && "id" in o) {
      out.push(o as unknown as Rule);
      return;
    }
    Object.values(o).forEach(visit);
  };
  visit(raw);
  return out;
}

/** Accepts {entryId: string[]} or {labels: {...}}. */
function normalizeGolden(raw: unknown): Record<string, string[]> {
  const o = raw as Record<string, unknown>;
  if (o && typeof o === "object" && o.labels && typeof o.labels === "object" && !Array.isArray(o.labels)) {
    return o.labels as Record<string, string[]>;
  }
  return o as Record<string, string[]>;
}

const clauseNum = (clauseId: string) => clauseId.split("__").pop() ?? clauseId;
const recType = (r: Rule) => r.recordType ?? (String(r.clauseId).includes("uscis") ? "h1b_petition" : "time_entry");
const setKey = (xs: string[]) => [...new Set(xs)].sort().join(",");

const allRules = normalizeRules(readJson("reference-rules.json"));
const timeRules = allRules.filter((r) => recType(r) === "time_entry");
const h1bRules = allRules.filter((r) => recType(r) === "h1b_petition");
const entries: TimeEntry[] = parseInvoiceCsv(
  fs.readFileSync(path.join(DATA, "invoice-oct.csv"), "utf8"),
  DEMO.invoiceId,
);
const golden = normalizeGolden(readJson("golden.json"));

function actualByEntry(): Map<string, string[]> {
  const flags = checkRecords(timeRules, entries as unknown as Record<string, unknown>[]);
  const m = new Map<string, string[]>();
  for (const f of flags) {
    const arr = m.get(f.entryId) ?? [];
    arr.push(clauseNum(f.clauseId));
    m.set(f.entryId, arr);
  }
  return m;
}

describe("golden set — Acme OCG reference rules on invoice-oct.csv", () => {
  it("data loads: 20 entries, 15 labels, ≥6 time-entry rules, no judgment rule 3.7", () => {
    expect(entries.length).toBe(20);
    expect(Object.keys(golden).length).toBe(15);
    expect(timeRules.length).toBeGreaterThanOrEqual(6);
    expect(timeRules.some((r) => clauseNum(r.clauseId) === "3.7")).toBe(false);
    for (const id of Object.keys(golden)) expect(entries.map((e) => e.id)).toContain(id);
  });

  it("parsed entries are contract-shaped (amount = hours × rate)", () => {
    for (const e of entries) {
      expect(typeof e.id).toBe("string");
      expect(e.invoiceId).toBe(DEMO.invoiceId);
      expect(e.matterId).toBe(DEMO.matterId);
      expect(typeof e.hours).toBe("number");
      expect(typeof e.rate).toBe("number");
      expect(e.amount).toBeCloseTo(e.hours * e.rate, 2);
      expect(["partner", "associate", "paralegal"]).toContain(e.role);
    }
  });

  it("≥14/15 labeled entries match exactly (target 15/15)", () => {
    const actual = actualByEntry();
    const mismatches: { entryId: string; expected: string; actual: string }[] = [];
    let correct = 0;
    for (const [id, exp] of Object.entries(golden)) {
      const a = setKey(actual.get(id) ?? []);
      const e = setKey(exp);
      if (a === e) correct++;
      else mismatches.push({ entryId: id, expected: e, actual: a });
    }
    // eslint-disable-next-line no-console
    console.log(`[golden] ${correct}/${Object.keys(golden).length} correct`, mismatches.length ? mismatches : "");
    expect(correct).toBeGreaterThanOrEqual(14);
  });

  it("near-miss (a): 'reviewed and revised …' under 0.5h is NOT flagged", () => {
    const nm = entries.filter((e) => /reviewed and revised/i.test(e.narrative) && e.hours <= 0.5);
    expect(nm.length).toBeGreaterThanOrEqual(1);
    const actual = actualByEntry();
    for (const e of nm) expect(actual.get(e.id) ?? []).toEqual([]);
  });

  it("near-miss (b): A109 meeting with exactly 2 timekeepers is NOT flagged for staffing", () => {
    const byDate = new Map<string, TimeEntry[]>();
    for (const e of entries.filter((x) => x.activityCode === "A109")) {
      byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
    }
    const pairs = [...byDate.values()].filter((g) => new Set(g.map((e) => e.timekeeperId)).size === 2);
    expect(pairs.length).toBeGreaterThanOrEqual(1);
    const actual = actualByEntry();
    for (const g of pairs) for (const e of g) expect(actual.get(e.id) ?? []).not.toContain("3.3");
  });

  it("each planted violation clause 3.1–3.6 is flagged at least once", () => {
    const flagged = new Set([...actualByEntry().values()].flat());
    for (const n of ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6"]) expect(flagged).toContain(n);
  });

  it("runTests sanity: every rule flags a golden-positive entry and passes a golden-clean entry", () => {
    for (const rule of timeRules) {
      const n = clauseNum(rule.clauseId);
      const posIds = Object.entries(golden).filter(([, v]) => v.includes(n)).map(([k]) => k);
      const clean = Object.entries(golden).find(([, v]) => v.length === 0)?.[0];
      // group rules need the whole day's records; entry rules need one record
      const recs = (ids: string[]) =>
        rule.scope === "group" ? entries : entries.filter((e) => ids.includes(e.id));
      const tests = [
        ...(posIds.length ? [{ name: `${n} positive`, records: recs(posIds.slice(0, 1)) as never, expectFlagged: true }] : []),
        ...(clean && rule.scope !== "group"
          ? [{ name: `${n} clean`, records: recs([clean]) as never, expectFlagged: false }]
          : []),
      ];
      const results = runTests(rule, tests);
      for (const r of results) expect(r.passed, `${rule.id} :: ${r.name}`).toBe(true);
    }
  });

  it("deterministic: two runs give identical flags", () => {
    const a = checkRecords(timeRules, entries as never);
    const b = checkRecords(timeRules, entries as never);
    expect(b).toEqual(a);
  });
});

describe("golden set — USCIS H-1B reference rules on petitions.json", () => {
  const rawPet = readJson("petitions.json");
  const petitions: Record<string, unknown>[] = Array.isArray(rawPet) ? rawPet : rawPet.petitions;

  it("flags only pet_02, on clauses 4.1 and 4.3", () => {
    expect(h1bRules.length).toBeGreaterThanOrEqual(3);
    const flags = checkRecords(h1bRules, petitions);
    const byPet = new Map<string, string[]>();
    for (const f of flags) byPet.set(f.entryId, [...(byPet.get(f.entryId) ?? []), clauseNum(f.clauseId)]);
    expect([...byPet.keys()]).toEqual(["pet_02"]);
    expect(setKey(byPet.get("pet_02") ?? [])).toBe("4.1,4.3");
  });
});
