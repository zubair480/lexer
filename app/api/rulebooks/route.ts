import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/server/db";
import { getRulebook, listRulebookSummaries } from "@/lib/server/rulebooks";
import { replaceClauses } from "@/lib/compiler/pipeline";
import { segmentRulebook } from "@/lib/compiler/segment";
import { DEMO, type CreateRulebookReq, type RecordType } from "@/shared/contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || `client_${nanoid(6)}`
  );
}

export async function GET() {
  try {
    return NextResponse.json(await listRulebookSummaries());
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let body: Partial<CreateRulebookReq>;
  try {
    body = (await req.json()) as Partial<CreateRulebookReq>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (body.recordType && body.recordType !== "time_entry" && body.recordType !== "h1b_petition") {
    return NextResponse.json({ error: "recordType must be time_entry or h1b_petition" }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const clientName = typeof body.clientName === "string" ? body.clientName.trim() : "";
  const sourceText = typeof body.sourceText === "string" ? body.sourceText : "";
  const recordType: RecordType = body.recordType === "h1b_petition" ? "h1b_petition" : "time_entry";
  if (!title || !clientName || !sourceText.trim()) {
    return NextResponse.json({ error: "title, clientName and sourceText are required" }, { status: 400 });
  }
  try {
    const clientId =
      clientName.toLowerCase() === DEMO.clientName.toLowerCase() ? DEMO.clientId : slugify(clientName);
    await prisma.client.upsert({
      where: { id: clientId },
      create: { id: clientId, name: clientName },
      update: {},
    });
    const id = `rb_${nanoid(8)}`;
    await prisma.rulebook.create({ data: { id, clientId, title, recordType, sourceText } });
    try {
      const clauses = await segmentRulebook(id, sourceText);
      await replaceClauses(id, clauses);
    } catch (e) {
      console.error("[rulebooks POST] segmentation failed", e);
    }
    const rb = await getRulebook(id);
    if (!rb) return NextResponse.json({ error: "Rulebook not found after create" }, { status: 500 });
    return NextResponse.json(rb);
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
