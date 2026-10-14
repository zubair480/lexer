import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/db";
import { toClause } from "@/lib/server/rulebooks";
import { compileAndPersistClause, withRulebookLock } from "@/lib/compiler/pipeline";
import type { RecordType } from "@/shared/contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const head = await prisma.rule.findUnique({ where: { id }, select: { rulebookId: true } });
    if (!head) return NextResponse.json({ error: `Rule ${id} not found` }, { status: 404 });
    // Serialize with any running compile of the same rulebook; re-read inside the lock.
    const compiled = await withRulebookLock(head.rulebookId, async () => {
      const rule = await prisma.rule.findUnique({ where: { id }, include: { clause: true, rulebook: true } });
      if (!rule) return null;
      return compileAndPersistClause(toClause(rule.clause), rule.rulebook.recordType as RecordType);
    });
    if (!compiled) return NextResponse.json({ error: `Rule ${id} not found` }, { status: 404 });
    return NextResponse.json(compiled);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
