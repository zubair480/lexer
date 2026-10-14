// B10 — GET /api/invoices/[id] -> Invoice
import { NextResponse } from "next/server";
import { getInvoice } from "@/lib/server/invoices";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const inv = await getInvoice(id);
    if (!inv) return NextResponse.json({ error: `Invoice not found: ${id}` }, { status: 404 });
    return NextResponse.json(inv);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Failed to load invoice" }, { status: 500 });
  }
}
