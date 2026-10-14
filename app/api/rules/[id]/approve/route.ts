import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/db";
import { toCompiledRule } from "@/lib/server/rulebooks";
import { logAudit } from "@/lib/server/audit";
import { DEMO, type ApproveRuleReq } from "@/shared/contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Partial<ApproveRuleReq> = {};
  try {
    body = (await req.json()) as Partial<ApproveRuleReq>;
  } catch {
    /* empty body allowed */
  }
  const approvedBy =
    typeof body.approvedBy === "string" && body.approvedBy.trim() ? body.approvedBy.trim() : DEMO.approver;
  try {
    const rule = await prisma.rule.findUnique({ where: { id } });
    if (!rule) return NextResponse.json({ error: `Rule ${id} not found` }, { status: 404 });
    if (rule.status === "active") return NextResponse.json(toCompiledRule(rule));
    if (rule.status === "needs_interpretation") {
      return NextResponse.json(
        { error: "Judgment clauses require human interpretation and cannot be auto-enforced" },
        { status: 409 },
      );
    }
    if (rule.status !== "verified" && rule.status !== "uncertain") {
      return NextResponse.json(
        { error: `Rule is ${rule.status}; only verified or uncertain rules can be approved` },
        { status: 409 },
      );
    }
    if (!rule.dsl) {
      return NextResponse.json({ error: "Rule has no compiled DSL to approve" }, { status: 409 });
    }
    const updated = await prisma.rule.update({
      where: { id },
      data: { status: "active", approvedBy, approvedAt: new Date() },
    });
    try {
      await logAudit({
        actor: approvedBy,
        action: "rule.approved",
        targetType: "rule",
        targetId: id,
        note: `was ${rule.status}`,
      });
    } catch {
      /* ignore audit failure */
    }
    return NextResponse.json(toCompiledRule(updated));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
