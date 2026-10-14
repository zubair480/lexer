import { NextResponse } from "next/server";
import { getRulebook } from "@/lib/server/rulebooks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const rb = await getRulebook(id);
    if (!rb) return NextResponse.json({ error: `Rulebook ${id} not found` }, { status: 404 });
    return NextResponse.json(rb);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
