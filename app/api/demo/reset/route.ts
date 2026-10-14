import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/db";
import { seedDemo } from "@/lib/server/seed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    await seedDemo(prisma);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
