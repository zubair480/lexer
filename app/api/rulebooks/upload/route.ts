// G2 — POST /api/rulebooks/upload (multipart: file, title?, clientName?, recordType?) -> Rulebook
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/server/db";
import { getRulebook } from "@/lib/server/rulebooks";
import { replaceClauses } from "@/lib/compiler/pipeline";
import { segmentRulebook } from "@/lib/compiler/segment";
import { extractText, UnsupportedFileError } from "@/lib/server/extract";
import { DEMO, type RecordType } from "@/shared/contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 15 * 1024 * 1024;

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || `client_${nanoid(6)}`
  );
}

function titleFromFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").replace(/[_\-]+/g, " ").trim();
  return base ? base.replace(/\b\w/g, (c) => c.toUpperCase()) : "Uploaded guidelines";
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data with a 'file' field" }, { status: 400 });
  }
  const file = form.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Missing 'file' upload" }, { status: 400 });
  }
  const f = file as File;
  if (f.size > MAX_BYTES) return NextResponse.json({ error: "File too large (max 15 MB)" }, { status: 413 });

  const rt = String(form.get("recordType") ?? "").trim();
  if (rt && rt !== "time_entry" && rt !== "h1b_petition") {
    return NextResponse.json({ error: "recordType must be time_entry or h1b_petition" }, { status: 400 });
  }
  const recordType: RecordType = rt === "h1b_petition" ? "h1b_petition" : "time_entry";
  const filename = f.name || "upload";
  const title = String(form.get("title") ?? "").trim() || titleFromFilename(filename);
  const clientName = String(form.get("clientName") ?? "").trim() || DEMO.clientName;

  let sourceText: string;
  try {
    sourceText = await extractText(filename, new Uint8Array(await f.arrayBuffer()));
  } catch (e) {
    if (e instanceof UnsupportedFileError) return NextResponse.json({ error: e.message }, { status: 415 });
    return NextResponse.json({ error: `Could not read ${filename}: ${(e as Error).message}` }, { status: 500 });
  }
  if (!sourceText.trim()) {
    return NextResponse.json(
      { error: `No text could be extracted from ${filename} (scanned PDFs without OCR are not supported)` },
      { status: 400 },
    );
  }

  try {
    const clientId = clientName.toLowerCase() === DEMO.clientName.toLowerCase() ? DEMO.clientId : slugify(clientName);
    await prisma.client.upsert({ where: { id: clientId }, create: { id: clientId, name: clientName }, update: {} });
    const id = `rb_${nanoid(8)}`;
    await prisma.rulebook.create({ data: { id, clientId, title, recordType, sourceText } });
    try {
      const clauses = await segmentRulebook(id, sourceText);
      await replaceClauses(id, clauses);
    } catch (e) {
      console.error("[rulebooks/upload] segmentation failed", e);
    }
    const rb = await getRulebook(id);
    if (!rb) return NextResponse.json({ error: "Rulebook not found after create" }, { status: 500 });
    return NextResponse.json(rb);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
