// G2 — POST /api/invoices/upload (multipart: file, clientId?, matterId?, period?) -> Invoice
// Accepts invoice CSV or LEDES 1998B (auto-detected).
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/server/db";
import { parseInvoiceFile } from "@/lib/server/csv";
import { getInvoice } from "@/lib/server/invoices";
import { DEMO } from "@/shared/contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data with a 'file' field" }, { status: 400 });
  }
  const file = form.get("file");
  if (!file || typeof file === "string") return NextResponse.json({ error: "Missing 'file' upload" }, { status: 400 });
  const f = file as File;
  if (f.size > MAX_BYTES) return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 413 });
  const filename = f.name || "upload";
  const ext = (filename.split(".").pop() || "").toLowerCase();
  const buf = new Uint8Array(await f.arrayBuffer());
  if (buf.length >= 4 && ((buf[0] === 0x25 && buf[1] === 0x50) || (buf[0] === 0x50 && buf[1] === 0x4b))) {
    return NextResponse.json({ error: `Unsupported invoice file "${filename}". Upload CSV or LEDES 1998B (.txt/.ledes).` }, { status: 415 });
  }
  if (ext && !["csv", "txt", "ledes", "tsv", "lds", "1998b"].includes(ext) && filename.includes(".")) {
    return NextResponse.json({ error: `Unsupported invoice file type ".${ext}". Upload CSV or LEDES 1998B.` }, { status: 415 });
  }
  const text = new TextDecoder("utf-8").decode(buf);
  if (!text.trim()) return NextResponse.json({ error: "Uploaded file is empty" }, { status: 400 });

  const clientId = String(form.get("clientId") ?? "").trim() || DEMO.clientId;
  const period = String(form.get("period") ?? "").trim() || new Date().toISOString().slice(0, 7);
  const id = `inv_${nanoid(8)}`;
  let parsed;
  try {
    parsed = parseInvoiceFile(text, id);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  const matterId = String(form.get("matterId") ?? "").trim() || parsed.find((e) => e.matterId)?.matterId || DEMO.matterId;

  try {
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return NextResponse.json({ error: `Unknown client: ${clientId}` }, { status: 400 });
    const entries = parsed.map((e, i) => ({
      ...e,
      id: e.id.startsWith(`${id}_`) ? e.id : `${id}_${e.id}`,
      matterId: e.matterId || matterId,
      ord: i,
    }));
    await prisma.invoice.create({
      data: {
        id, clientId, matterId, period, recordType: "time_entry",
        entries: { create: entries.map(({ invoiceId: _inv, ...rest }) => rest) },
      },
    });
    return NextResponse.json(await getInvoice(id));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Failed to create invoice" }, { status: 500 });
  }
}
