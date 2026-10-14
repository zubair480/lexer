import { NextResponse } from "next/server";
import type { ReviewItem, Rule, TestResult } from "@/shared/contract";
import { prisma } from "@/lib/server/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parse<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export async function GET() {
  try {
    const items: ReviewItem[] = [];

    const uncertain = await prisma.rule.findMany({
      where: { status: "uncertain" },
      include: { clause: true },
    });
    for (const r of uncertain) {
      const dsl = parse<Rule | null>(r.dsl, null);
      const results = parse<TestResult[]>(r.testResults, []);
      const failing = results.filter((t) => !t.passed);
      const detail =
        results.length === 0
          ? `Could not compile a passing rule after ${r.attempts} attempt(s).`
          : `${failing.length} of ${results.length} tests failing after ${r.attempts} attempt(s)` +
            (failing.length ? `: ${failing.map((t) => t.name).join("; ")}` : ".");
      items.push({
        id: `review_rule_${r.id}`,
        type: "uncertain_rule",
        title: `§${r.clause.number} ${dsl?.title || r.clause.title}`,
        detail,
        refId: r.id,
        createdAt: r.updatedAt.toISOString(),
      });
    }

    const judgment = await prisma.clause.findMany({
      where: { kind: "judgment" },
      include: { rulebook: true },
      orderBy: { ord: "asc" },
    });
    for (const c of judgment) {
      items.push({
        id: `review_clause_${c.id}`,
        type: "judgment_clause",
        title: `§${c.number} ${c.title}`,
        detail: c.kindReason || "Requires human judgment; not auto-enforced.",
        refId: c.id,
        createdAt: c.rulebook.createdAt.toISOString(),
      });
    }

    const dismissed = await prisma.flag.findMany({ where: { status: "dismissed" } });
    for (const f of dismissed) {
      items.push({
        id: `review_flag_${f.id}`,
        type: "dismissed_flag",
        title: `§${f.clauseNumber} ${f.ruleTitle} — ${f.entryId}`,
        detail: f.note || "Dismissed without a note.",
        refId: f.id,
        createdAt: f.createdAt.toISOString(),
      });
    }

    return NextResponse.json(items);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
