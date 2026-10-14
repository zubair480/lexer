// B10 — invoice/flag read helpers.
import type { Flag as FlagRow, TimeEntry as EntryRow } from "@prisma/client";
import type {
  Flag, FlagStatus, Invoice, InvoiceSummary, InvoiceTotals, Role, Severity, Suggestion, TimeEntry,
} from "@/shared/contract";
import { prisma } from "@/lib/server/db";

const round2 = (n: number) => Math.round(n * 100) / 100;

export function toEntry(row: EntryRow): TimeEntry {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    date: row.date,
    timekeeperId: row.timekeeperId,
    timekeeperName: row.timekeeperName,
    role: row.role as Role,
    hours: row.hours,
    rate: row.rate,
    amount: row.amount,
    taskCode: row.taskCode,
    activityCode: row.activityCode,
    narrative: row.narrative,
    matterId: row.matterId,
  };
}

export function toFlag(row: FlagRow): Flag {
  let suggestion: Suggestion | null = null;
  if (row.suggestion) {
    try {
      suggestion = JSON.parse(row.suggestion) as Suggestion;
    } catch {
      suggestion = null;
    }
  }
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    entryId: row.entryId,
    ruleId: row.ruleId,
    clauseId: row.clauseId,
    clauseNumber: row.clauseNumber,
    ruleTitle: row.ruleTitle,
    severity: row.severity as Severity,
    message: row.message,
    impactUsd: row.impactUsd,
    status: row.status as FlagStatus,
    note: row.note ?? undefined,
    suggestion,
  };
}

export function computeTotals(
  entries: Pick<TimeEntry, "amount">[],
  flags: Pick<Flag, "status" | "impactUsd" | "entryId">[],
): InvoiceTotals {
  const live = flags.filter((f) => f.status !== "dismissed");
  return {
    billed: round2(entries.reduce((s, e) => s + (e.amount || 0), 0)),
    atRisk: round2(live.reduce((s, f) => s + (f.impactUsd || 0), 0)),
    entryCount: entries.length,
    flaggedCount: new Set(live.map((f) => f.entryId)).size,
  };
}

/** Clause numbers like "3.10" vs "3.2" — compare numerically per segment. */
function cmpClause(a: string, b: string): number {
  const pa = a.split(".").map((x) => parseInt(x, 10));
  const pb = b.split(".").map((x) => parseInt(x, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? -1, y = pb[i] ?? -1;
    if (Number.isNaN(x) || Number.isNaN(y)) return a.localeCompare(b);
    if (x !== y) return x - y;
  }
  return 0;
}

/** Flags ordered by entry ord (unknown entries, e.g. H-1B petitions, keep insertion order last), then clause number. */
export async function getFlags(invoiceId: string): Promise<Flag[]> {
  const [rows, entries] = await Promise.all([
    prisma.flag.findMany({ where: { invoiceId }, orderBy: { createdAt: "asc" } }),
    prisma.timeEntry.findMany({ where: { invoiceId }, select: { id: true, ord: true } }),
  ]);
  const ord = new Map(entries.map((e) => [e.id, e.ord]));
  const idx = new Map(rows.map((r, i) => [r.id, i]));
  return rows
    .slice()
    .sort((a, b) => {
      const oa = ord.get(a.entryId) ?? Number.MAX_SAFE_INTEGER;
      const ob = ord.get(b.entryId) ?? Number.MAX_SAFE_INTEGER;
      if (oa !== ob) return oa - ob;
      if (a.entryId !== b.entryId) return a.entryId.localeCompare(b.entryId);
      const c = cmpClause(a.clauseNumber, b.clauseNumber);
      return c !== 0 ? c : idx.get(a.id)! - idx.get(b.id)!;
    })
    .map(toFlag);
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  const inv = await prisma.invoice.findUnique({
    where: { id },
    include: { entries: { orderBy: { ord: "asc" } }, flags: true },
  });
  if (!inv) return null;
  const entries = inv.entries.map(toEntry);
  return {
    id: inv.id,
    clientId: inv.clientId,
    matterId: inv.matterId,
    period: inv.period,
    entries,
    totals: computeTotals(entries, inv.flags.map(toFlag)),
  };
}

export async function getInvoiceSummary(id: string): Promise<InvoiceSummary | null> {
  const inv = await getInvoice(id);
  if (!inv) return null;
  return { id: inv.id, matterId: inv.matterId, period: inv.period, totals: inv.totals };
}

export async function listInvoiceSummaries(): Promise<InvoiceSummary[]> {
  const invs = await prisma.invoice.findMany({
    include: { entries: { select: { amount: true } }, flags: true },
    orderBy: [{ period: "desc" }, { id: "asc" }],
  });
  return invs.map((inv) => ({
    id: inv.id,
    matterId: inv.matterId,
    period: inv.period,
    totals: computeTotals(inv.entries, inv.flags.map(toFlag)),
  }));
}
