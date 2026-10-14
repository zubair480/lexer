// B10 — GET /api/invoices -> InvoiceSummary[] | POST CreateInvoiceReq -> Invoice
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import type { CreateInvoiceReq } from "@/shared/contract";
import { prisma } from "@/lib/server/db";
import { parseInvoiceCsv } from "@/lib/server/csv";
import { getInvoice, listInvoiceSummaries } from "@/lib/server/invoices";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await listInvoiceSummaries());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Failed to list invoices" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let body: Partial<CreateInvoiceReq>;
  try {
    body = (await req.json()) as Partial<CreateInvoiceReq>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { clientId, matterId, period, csv } = body ?? {};
  if (!clientId || !matterId || !period || typeof csv !== "string" || !csv.trim()) {
    return NextResponse.json({ error: "clientId, matterId, period and csv are required" }, { status: 400 });
  }
  const id = `inv_${nanoid(8)}`;
  let parsed;
  try {
    parsed = parseInvoiceCsv(csv, id);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  try {
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return NextResponse.json({ error: `Unknown client: ${clientId}` }, { status: 400 });
    // Entry ids are global primary keys: namespace them by invoice so the same CSV can be uploaded twice.
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
