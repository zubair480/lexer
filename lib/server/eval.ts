import fs from "node:fs";
import path from "node:path";
import type { EvalResult, EvalRuleRow } from "@/shared/contract";
import { DEMO } from "@/shared/contract";
import { prisma } from "@/lib/server/db";
import { checkRecords } from "@/lib/engine";
import type { EngineRecord } from "@/lib/engine/types";
import { getActiveRules } from "@/lib/server/rulebooks";
import { loadGolden } from "@/lib/server/seed";

function readGolden(): Record<string, string[]> {
  try {
    return loadGolden();
  } catch {
    /* fall through to direct read */
  }
  try {
    const p = path.join(process.cwd(), "data", "golden.json");
    return JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, string[]>;
  } catch {
    return {};
  }
}

function numberFromClauseId(clauseId: string): string {
  const i = clauseId.lastIndexOf("__");
  return i >= 0 ? clauseId.slice(i + 2) : clauseId;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function rulebookIdFromClauseId(clauseId: string): string | null {
  const i = clauseId.lastIndexOf("__");
  return i >= 0 ? clauseId.slice(0, i) : null;
}

export async function evaluateInvoice(invoiceId: string): Promise<EvalResult> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { entries: { orderBy: { ord: "asc" } }, flags: true },
  });
  if (!invoice) throw Object.assign(new Error(`Invoice not found: ${invoiceId}`), { status: 404 });

  const golden = readGolden();
  const entryIds = new Set(invoice.entries.map((e) => e.id));

  // Determine rulebook: from existing flags, else the demo rulebook.
  const rulebookId =
    (invoice.flags[0] && rulebookIdFromClauseId(invoice.flags[0].clauseId)) || DEMO.rulebookId;

  // Actual output: entryId -> set of clause numbers; plus entryId -> set of ruleIds
  const actualClauses = new Map<string, Set<string>>();
  const actualRules = new Map<string, Set<string>>();
  const add = (entryId: string, ruleId: string, clauseNumber: string) => {
    if (!actualClauses.has(entryId)) actualClauses.set(entryId, new Set());
    if (!actualRules.has(entryId)) actualRules.set(entryId, new Set());
    actualClauses.get(entryId)!.add(clauseNumber);
    actualRules.get(entryId)!.add(ruleId);
  };

  const activeRules = await getActiveRules(rulebookId);

  if (invoice.flags.length > 0) {
    for (const f of invoice.flags) add(f.entryId, f.ruleId, f.clauseNumber);
  } else {
    const records = invoice.entries.map((e) => ({ ...e }) as unknown as EngineRecord);
    for (const ef of checkRecords(activeRules, records)) {
      add(ef.entryId, ef.ruleId, numberFromClauseId(ef.clauseId));
    }
  }

  // Labeled entries = golden keys present in this invoice.
  const labeled = Object.keys(golden).filter((id) => entryIds.has(id));

  let correct = 0;
  const mismatches: EvalResult["mismatches"] = [];
  for (const entryId of labeled) {
    const expected = [...new Set(golden[entryId] ?? [])].sort();
    const actual = [...(actualClauses.get(entryId) ?? new Set<string>())].sort();
    const same = expected.length === actual.length && expected.every((x, i) => x === actual[i]);
    if (same) correct++;
    else mismatches.push({ entryId, expected, actual });
  }

  // Per-rule rows: one per active rule.
  const clauseRows = await prisma.clause.findMany({
    where: { id: { in: activeRules.map((r) => r.clauseId) } },
  });
  const clauseById = new Map(clauseRows.map((c) => [c.id, c]));

  const perRule: EvalRuleRow[] = activeRules.map((rule) => {
    const clause = clauseById.get(rule.clauseId);
    const clauseNumber = clause?.number ?? numberFromClauseId(rule.clauseId);
    let tp = 0;
    let fp = 0;
    let fn = 0;
    for (const entryId of labeled) {
      const expected = (golden[entryId] ?? []).includes(clauseNumber);
      const actual =
        (actualRules.get(entryId)?.has(rule.id) ?? false) ||
        (actualClauses.get(entryId)?.has(clauseNumber) ?? false);
      if (expected && actual) tp++;
      else if (!expected && actual) fp++;
      else if (expected && !actual) fn++;
    }
    return {
      ruleId: rule.id,
      clauseNumber,
      title: rule.title || clause?.title || clauseNumber,
      tp,
      fp,
      fn,
      precision: round3(tp + fp === 0 ? 1 : tp / (tp + fp)),
      recall: round3(tp + fn === 0 ? 1 : tp / (tp + fn)),
    };
  });

  return { invoiceId, correct, total: labeled.length, perRule, mismatches };
}
