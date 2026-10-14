// B10 — PATCH /api/flags/[id]  UpdateFlagReq -> Flag
import { NextResponse } from "next/server";
import { DEMO, type FlagStatus, type UpdateFlagReq } from "@/shared/contract";
import { prisma } from "@/lib/server/db";
import { toFlag } from "@/lib/server/invoices";
import { logAudit } from "@/lib/server/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATUSES: FlagStatus[] = ["open", "accepted", "dismissed"];
const ACTION: Record<FlagStatus, string> = { accepted: "flag.accepted", dismissed: "flag.dismissed", open: "flag.reopened" };

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Partial<UpdateFlagReq>;
  try {
    body = (await req.json()) as Partial<UpdateFlagReq>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const status = body?.status;
  if (!status || !STATUSES.includes(status)) {
    return NextResponse.json({ error: `status must be one of ${STATUSES.join(", ")}` }, { status: 400 });
  }
  if (body.note !== undefined && body.note !== null && typeof body.note !== "string") {
    return NextResponse.json({ error: "note must be a string" }, { status: 400 });
  }
  try {
    const existing = await prisma.flag.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: `Flag not found: ${id}` }, { status: 404 });
    const note = typeof body.note === "string" ? body.note.trim() || null : existing.note;
    const row = await prisma.flag.update({ where: { id }, data: { status, note } });
    try {
      await logAudit({
        actor: DEMO.approver,
        action: ACTION[status],
        targetType: "flag",
        targetId: id,
        note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : undefined,
      });
    } catch (e) {
      console.error("[flags PATCH] audit failed", e);
    }
    return NextResponse.json(toFlag(row));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Failed to update flag" }, { status: 500 });
  }
}
