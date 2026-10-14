// B10 — GET /api/dashboard -> DashboardSummary
import { NextResponse } from "next/server";
import { DEMO, type DashboardSummary } from "@/shared/contract";
import { prisma } from "@/lib/server/db";
import { listRulebookSummaries } from "@/lib/server/rulebooks";
import { getInvoiceSummary } from "@/lib/server/invoices";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const [client, summaries, latestInvoice] = await Promise.all([
      prisma.client.findUnique({ where: { id: DEMO.clientId } }),
      listRulebookSummaries(),
      getInvoiceSummary(DEMO.invoiceId),
    ]);
    const body: DashboardSummary = {
      client: { id: client?.id ?? DEMO.clientId, name: client?.name ?? DEMO.clientName },
      rulebook: summaries.find((s) => s.id === DEMO.rulebookId) ?? null,
      latestInvoice,
    };
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Failed to load dashboard" }, { status: 500 });
  }
}
