// B10 — GET /api/invoices/[id]/flags -> Flag[]
import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/db";
import { getFlags } from "@/lib/server/invoices";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const inv = await prisma.invoice.findUnique({ where: { id }, select: { id: true } });
    if (!inv) return NextResponse.json({ error: `Invoice not found: ${id}` }, { status: 404 });
    return NextResponse.json(await getFlags(id));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Failed to load flags" }, { status: 500 });
  }
}
