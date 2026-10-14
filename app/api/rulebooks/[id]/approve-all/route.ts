import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/db";
import { getRulebook } from "@/lib/server/rulebooks";
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
    const rb = await prisma.rulebook.findUnique({ where: { id } });
    if (!rb) return NextResponse.json({ error: `Rulebook ${id} not found` }, { status: 404 });
    const verified = await prisma.rule.findMany({ where: { rulebookId: id, status: "verified" } });
    const approvedAt = new Date();
    for (const r of verified) {
      await prisma.rule.update({ where: { id: r.id }, data: { status: "active", approvedBy, approvedAt } });
      try {
        await logAudit({
          actor: approvedBy,
          action: "rule.approved",
          targetType: "rule",
          targetId: r.id,
          note: "approve-all",
        });
      } catch {
        /* ignore audit failure */
      }
    }
    const full = await getRulebook(id);
    return NextResponse.json(full);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
