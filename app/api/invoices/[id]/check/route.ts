// B10 — POST /api/invoices/[id]/check  CheckInvoiceReq -> InvoiceCheckResult
import { NextResponse } from "next/server";
import type { CheckInvoiceReq, InvoiceCheckResult } from "@/shared/contract";
import { prisma } from "@/lib/server/db";
import { getActiveRules } from "@/lib/server/rulebooks";
import { loadPetitions } from "@/lib/server/seed";
import { checkRecords } from "@/lib/engine";
import type { EngineRecord } from "@/lib/engine/types";
import { computeTotals, getFlags, getInvoice } from "@/lib/server/invoices";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: invoiceId } = await params;
  let body: Partial<CheckInvoiceReq>;
  try {
    body = (await req.json()) as Partial<CheckInvoiceReq>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const rulebookId = body?.rulebookId;
  if (!rulebookId || typeof rulebookId !== "string") {
    return NextResponse.json({ error: "rulebookId is required" }, { status: 400 });
  }

  try {
    const [invoice, rulebook] = await Promise.all([
      getInvoice(invoiceId),
      prisma.rulebook.findUnique({ where: { id: rulebookId }, select: { id: true, recordType: true } }),
    ]);
    if (!invoice) return NextResponse.json({ error: `Invoice not found: ${invoiceId}` }, { status: 404 });
    if (!rulebook) return NextResponse.json({ error: `Rulebook not found: ${rulebookId}` }, { status: 404 });

    const rules = await getActiveRules(rulebookId);
    const records: EngineRecord[] =
      rulebook.recordType === "h1b_petition"
        ? (loadPetitions() as unknown as EngineRecord[])
        : (invoice.entries as unknown as EngineRecord[]);

    const engineFlags = rules.length && records.length ? checkRecords(rules, records) : [];

    const clauseIds = [...new Set(rules.map((r) => r.clauseId))];
    const clauses = clauseIds.length
      ? await prisma.clause.findMany({ where: { id: { in: clauseIds } }, select: { id: true, number: true } })
      : [];
    const clauseNo = new Map(clauses.map((c) => [c.id, c.number]));
    const ruleById = new Map(rules.map((r) => [r.id, r]));

    // Flags this rulebook could own on this invoice (so checking with rulebook A doesn't wipe rulebook B's flags).
    const ruleIdsOfBook = (
      await prisma.rule.findMany({ where: { rulebookId }, select: { id: true } })
    ).map((r) => r.id);

    const seen = new Set<string>();
    const fresh = engineFlags
      .map((f) => {
        const rule = ruleById.get(f.ruleId);
        return {
          id: `flag_${invoiceId}__${f.entryId}__${f.ruleId}`,
          invoiceId,
          entryId: f.entryId,
          ruleId: f.ruleId,
          clauseId: f.clauseId,
          clauseNumber: clauseNo.get(f.clauseId) ?? f.clauseId.split("__").pop() ?? "",
          ruleTitle: rule?.title ?? f.ruleId,
          severity: f.severity,
          message: f.message,
          impactUsd: Math.round((f.impactUsd || 0) * 100) / 100,
        };
      })
      .filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)));
    const freshIds = fresh.map((f) => f.id);

    await prisma.$transaction([
      prisma.flag.deleteMany({
        where: {
          invoiceId,
          ruleId: { in: ruleIdsOfBook },
          ...(freshIds.length ? { id: { notIn: freshIds } } : {}),
        },
      }),
      // upsert: update keeps status / note / suggestion of an existing flag
      ...fresh.map((f) =>
        prisma.flag.upsert({
          where: { id: f.id },
          create: { ...f, status: "open" },
          update: {
            clauseId: f.clauseId, clauseNumber: f.clauseNumber, ruleTitle: f.ruleTitle,
            severity: f.severity, message: f.message, impactUsd: f.impactUsd,
          },
        }),
      ),
    ]);

    const all = await getFlags(invoiceId);
    const flags = all.filter((f) => ruleById.has(f.ruleId));
    const result: InvoiceCheckResult = {
      invoiceId,
      rulebookId,
      flags,
      totals: computeTotals(invoice.entries, all),
    };
    return NextResponse.json(result);
  } catch (e) {
    console.error("[invoices check]", e);
    return NextResponse.json({ error: (e as Error).message || "Check failed" }, { status: 500 });
  }
}
