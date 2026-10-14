import { prisma } from "@/lib/server/db";
import { getRulebook, toClause, toCompiledRule } from "@/lib/server/rulebooks";
import { logAudit } from "@/lib/server/audit";
import { segmentRulebook } from "@/lib/compiler/segment";
import { classifyClause } from "@/lib/compiler/classify";
import { compileClause, type CompileProgress } from "@/lib/compiler/compile";
import type {
  Clause,
  CompileEvent,
  CompiledRule,
  RecordType,
  RuleStatus,
} from "@/shared/contract";

const CONCURRENCY = 4;
const CLAUSE_STAGGER_MS = 150;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function ruleIdFor(clauseId: string): string {
  return `rule_${clauseId}`;
}

/**
 * Compile one compilable clause: (re)creates the rule row, streams progress,
 * persists every state change, and returns the final CompiledRule.
 * Never throws — on failure the rule is persisted as "uncertain".
 */
export async function compileAndPersistClause(
  clause: Clause,
  recordType: RecordType,
  emit: (e: CompileEvent) => void = () => {},
): Promise<CompiledRule> {
  const ruleId = ruleIdFor(clause.id);
  await prisma.rule.upsert({
    where: { id: ruleId },
    create: {
      id: ruleId,
      clauseId: clause.id,
      rulebookId: clause.rulebookId,
      status: "pending",
      attempts: 0,
      dsl: null,
      tests: "[]",
      testResults: "[]",
    },
    update: {
      status: "pending",
      attempts: 0,
      dsl: null,
      tests: "[]",
      testResults: "[]",
      approvedBy: null,
      approvedAt: null,
    },
  });
  emit({ type: "rule_status", clauseId: clause.id, ruleId, status: "pending", attempt: 0 });

  // Serialize DB writes for this rule so progress updates land in order.
  let writes: Promise<unknown> = Promise.resolve();
  const queueWrite = (data: Parameters<typeof prisma.rule.update>[0]["data"]) => {
    writes = writes
      .then(() => prisma.rule.update({ where: { id: ruleId }, data }))
      .catch(() => undefined);
  };

  const onProgress = (p: CompileProgress) => {
    try {
      if (p.kind === "status") {
        emit({ type: "rule_status", clauseId: clause.id, ruleId, status: p.status, attempt: p.attempt });
        queueWrite({ status: p.status, attempts: p.attempt });
      } else {
        emit({ type: "test_results", clauseId: clause.id, ruleId, results: p.results });
        queueWrite({ testResults: JSON.stringify(p.results), attempts: p.attempt });
      }
    } catch {
      /* never let progress reporting break compilation */
    }
  };

  try {
    const res = await compileClause(clause, recordType, onProgress);
    await writes;
    const row = await prisma.rule.update({
      where: { id: ruleId },
      data: {
        status: res.status,
        attempts: res.attempts,
        dsl: res.rule ? JSON.stringify(res.rule) : null,
        tests: JSON.stringify(res.tests ?? []),
        testResults: JSON.stringify(res.testResults ?? []),
      },
    });
    const compiled = toCompiledRule(row);
    emit({ type: "rule_status", clauseId: clause.id, ruleId, status: compiled.status, attempt: compiled.attempts });
    emit({ type: "rule_compiled", rule: compiled });
    return compiled;
  } catch (e) {
    await writes;
    emit({ type: "error", message: `Clause ${clause.number}: ${errMsg(e)}`, clauseId: clause.id });
    const row = await prisma.rule.update({
      where: { id: ruleId },
      data: { status: "uncertain" },
    });
    const compiled = toCompiledRule(row);
    emit({ type: "rule_status", clauseId: clause.id, ruleId, status: "uncertain", attempt: compiled.attempts });
    emit({ type: "rule_compiled", rule: compiled });
    return compiled;
  }
}

async function processClause(
  clause: Clause,
  recordType: RecordType,
  emit: (e: CompileEvent) => void,
): Promise<void> {
  try {
    let kind: Clause["kind"];
    let reason = "";
    try {
      const c = await classifyClause(clause, recordType);
      kind = c.kind;
      reason = c.reason;
    } catch (e) {
      kind = "compilable";
      reason = `Classification failed (${errMsg(e)}); defaulting to compilable.`;
    }
    await prisma.clause.update({ where: { id: clause.id }, data: { kind, kindReason: reason } });
    emit({ type: "classified", clauseId: clause.id, kind: kind!, reason });

    if (kind === "informational") return;

    if (kind === "judgment") {
      const ruleId = ruleIdFor(clause.id);
      const row = await prisma.rule.upsert({
        where: { id: ruleId },
        create: {
          id: ruleId,
          clauseId: clause.id,
          rulebookId: clause.rulebookId,
          status: "needs_interpretation",
          attempts: 0,
          dsl: null,
          tests: "[]",
          testResults: "[]",
        },
        update: { status: "needs_interpretation", dsl: null, attempts: 0 },
      });
      emit({ type: "rule_status", clauseId: clause.id, ruleId, status: "needs_interpretation" as RuleStatus, attempt: 0 });
      emit({ type: "rule_compiled", rule: toCompiledRule(row) });
      return;
    }

    await compileAndPersistClause({ ...clause, kind, kindReason: reason }, recordType, emit);
  } catch (e) {
    emit({ type: "error", message: `Clause ${clause.number}: ${errMsg(e)}`, clauseId: clause.id });
    try {
      const ruleId = ruleIdFor(clause.id);
      const row = await prisma.rule.upsert({
        where: { id: ruleId },
        create: {
          id: ruleId,
          clauseId: clause.id,
          rulebookId: clause.rulebookId,
          status: "uncertain",
          attempts: 0,
          dsl: null,
          tests: "[]",
          testResults: "[]",
        },
        update: { status: "uncertain" },
      });
      emit({ type: "rule_compiled", rule: toCompiledRule(row) });
    } catch {
      /* swallow */
    }
  }
}

async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i]);
    }
  });
  await Promise.all(workers);
}

/** Persist segmented clauses (replacing any existing clauses/rules for the rulebook). */
export async function replaceClauses(rulebookId: string, clauses: Clause[]): Promise<Clause[]> {
  await prisma.rule.deleteMany({ where: { rulebookId } });
  await prisma.clause.deleteMany({ where: { rulebookId } });
  const out: Clause[] = [];
  for (let i = 0; i < clauses.length; i++) {
    const c = clauses[i];
    const row = await prisma.clause.create({
      data: {
        id: c.id,
        rulebookId,
        number: c.number,
        title: c.title,
        text: c.text,
        start: c.start,
        end: c.end,
        kind: c.kind ?? null,
        kindReason: c.kindReason ?? null,
        ord: i,
      },
    });
    out.push(toClause(row));
  }
  return out;
}

export async function runCompilePipeline(
  rulebookId: string,
  emit: (e: CompileEvent) => void,
): Promise<void> {
  const safeEmit = (e: CompileEvent) => {
    try {
      emit(e);
    } catch {
      /* client gone — keep persisting */
    }
  };
  try {
    const rb = await prisma.rulebook.findUnique({ where: { id: rulebookId } });
    if (!rb) {
      safeEmit({ type: "error", message: `Rulebook ${rulebookId} not found` });
      return;
    }
    const recordType = rb.recordType as RecordType;

    const segmented = await segmentRulebook(rulebookId, rb.sourceText);
    const clauses = await replaceClauses(rulebookId, segmented);

    safeEmit({ type: "started", rulebookId, clauseCount: clauses.length });
    for (const clause of clauses) {
      safeEmit({ type: "clause_found", clause });
      await sleep(CLAUSE_STAGGER_MS);
    }

    await runPool(clauses, CONCURRENCY, (c) => processClause(c, recordType, safeEmit));

    try {
      await logAudit({
        actor: "system",
        action: "rulebook.compiled",
        targetType: "rulebook",
        targetId: rulebookId,
        note: `${clauses.length} clauses compiled`,
      });
    } catch {
      /* audit failure must not break the stream */
    }

    const full = await getRulebook(rulebookId);
    if (full) safeEmit({ type: "done", rulebook: full });
    else safeEmit({ type: "error", message: `Rulebook ${rulebookId} disappeared` });
  } catch (e) {
    safeEmit({ type: "error", message: errMsg(e) });
    try {
      const full = await getRulebook(rulebookId);
      if (full) safeEmit({ type: "done", rulebook: full });
    } catch {
      /* ignore */
    }
  }
}
