import { prisma } from "@/lib/server/db";
import type {
  Clause,
  ClauseKind,
  CompiledRule,
  RecordType,
  Rule,
  RuleStatus,
  RuleTest,
  Rulebook,
  RulebookSummary,
  TestResult,
} from "@/shared/contract";

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null || raw === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export interface RuleRow {
  id: string;
  clauseId: string;
  status: string;
  attempts: number;
  dsl: string | null;
  tests: string;
  testResults: string;
  approvedBy: string | null;
  approvedAt: Date | null;
}

export interface ClauseRow {
  id: string;
  rulebookId: string;
  number: string;
  title: string;
  text: string;
  start: number;
  end: number;
  kind: string | null;
  kindReason: string | null;
}

export function toCompiledRule(row: RuleRow): CompiledRule {
  const out: CompiledRule = {
    id: row.id,
    clauseId: row.clauseId,
    status: row.status as RuleStatus,
    attempts: row.attempts,
    dsl: parseJson<Rule | null>(row.dsl, null),
    tests: parseJson<RuleTest[]>(row.tests, []),
    testResults: parseJson<TestResult[]>(row.testResults, []),
  };
  if (row.approvedBy) out.approvedBy = row.approvedBy;
  if (row.approvedAt) out.approvedAt = row.approvedAt.toISOString();
  return out;
}

export function toClause(row: ClauseRow): Clause {
  const out: Clause = {
    id: row.id,
    rulebookId: row.rulebookId,
    number: row.number,
    title: row.title,
    text: row.text,
    start: row.start,
    end: row.end,
  };
  if (row.kind) out.kind = row.kind as ClauseKind;
  if (row.kindReason) out.kindReason = row.kindReason;
  return out;
}

export async function getRulebook(id: string): Promise<Rulebook | null> {
  const rb = await prisma.rulebook.findUnique({
    where: { id },
    include: {
      client: true,
      clauses: { orderBy: { ord: "asc" } },
      rules: { orderBy: [{ clause: { ord: "asc" } }, { id: "asc" }] },
    },
  });
  if (!rb) return null;
  return {
    id: rb.id,
    clientId: rb.clientId,
    clientName: rb.client?.name ?? rb.clientId,
    title: rb.title,
    recordType: rb.recordType as RecordType,
    sourceText: rb.sourceText,
    clauses: rb.clauses.map(toClause),
    rules: rb.rules.map(toCompiledRule),
    createdAt: rb.createdAt.toISOString(),
  };
}

export async function listRulebookSummaries(): Promise<RulebookSummary[]> {
  const rbs = await prisma.rulebook.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      client: true,
      _count: { select: { clauses: true } },
      rules: { select: { status: true } },
    },
  });
  return rbs.map((rb) => {
    const statusCounts: Partial<Record<RuleStatus, number>> = {};
    for (const r of rb.rules) {
      const s = r.status as RuleStatus;
      statusCounts[s] = (statusCounts[s] ?? 0) + 1;
    }
    return {
      id: rb.id,
      title: rb.title,
      clientName: rb.client?.name ?? rb.clientId,
      recordType: rb.recordType as RecordType,
      clauseCount: rb._count.clauses,
      statusCounts,
    };
  });
}

export async function getActiveRules(rulebookId: string): Promise<Rule[]> {
  const rows = await prisma.rule.findMany({
    where: { rulebookId, status: "active", NOT: { dsl: null } },
    orderBy: [{ clause: { ord: "asc" } }, { id: "asc" }],
  });
  const out: Rule[] = [];
  for (const row of rows) {
    const dsl = parseJson<Rule | null>(row.dsl, null);
    if (dsl) out.push(dsl);
  }
  return out;
}
