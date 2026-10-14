import { z } from "zod";
import type { Flag, Rule, Suggestion, TimeEntry } from "@/shared/contract";
import { prisma } from "@/lib/server/db";
import { llmStructured } from "@/lib/server/llm";
import { checkRecords } from "@/lib/engine";
import type { EngineRecord } from "@/lib/engine/types";
import { toFlag } from "@/lib/server/invoices";
import { logAudit } from "@/lib/server/audit";

export class SuggestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const SuggestSchema = z.object({
  explanation: z.string(),
  narrative: z.string().nullish(),
  splitEntries: z
    .array(
      z.object({
        narrative: z.string(),
        hours: z.number(),
        taskCode: z.string().nullish(),
        activityCode: z.string().nullish(),
      }),
    )
    .nullish(),
});
type SuggestOut = z.infer<typeof SuggestSchema>;

const SYSTEM = `You are a legal billing editor helping a law firm fix time entries that violate a client's outside counsel guidelines.
You are given the guideline clause text, the detected violation, and the offending time entry.
Rules:
- If the violation is a vague / non-descriptive narrative: rewrite the narrative to be specific and single-task, using ONLY facts present in the original narrative (never invent parties, documents, dates or outcomes). Return it in "narrative".
- If the violation is block billing (multiple tasks in one entry): split the entry into single-task entries in "splitEntries", each with its own narrative and hours. The hours MUST sum EXACTLY to the original hours, each in 0.1 increments. Never invent tasks beyond those in the narrative.
- If the violation is about travel, clerical/administrative work, staffing, rates, or a daily hours cap (anything a narrative rewrite cannot legitimately cure): do NOT return a narrative or splitEntries. Return only an "explanation" saying no narrative fix is appropriate and what the firm should do instead (e.g. write down, reduce, or remove).
- "explanation" is always required: one or two plain sentences for the reviewing attorney.`;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function rowToEntry(r: {
  id: string; invoiceId: string; date: string; timekeeperId: string; timekeeperName: string; role: string;
  hours: number; rate: number; amount: number; taskCode: string; activityCode: string; narrative: string; matterId: string;
}): TimeEntry {
  return {
    id: r.id,
    invoiceId: r.invoiceId,
    date: r.date,
    timekeeperId: r.timekeeperId,
    timekeeperName: r.timekeeperName,
    role: r.role as TimeEntry["role"],
    hours: r.hours,
    rate: r.rate,
    amount: r.amount,
    taskCode: r.taskCode,
    activityCode: r.activityCode,
    narrative: r.narrative,
    matterId: r.matterId,
  };
}

export async function suggestFix(flagId: string): Promise<Flag> {
  const flagRow = await prisma.flag.findUnique({ where: { id: flagId } });
  if (!flagRow) throw new SuggestError(`Flag not found: ${flagId}`, 404);

  const entryRow = await prisma.timeEntry.findUnique({ where: { id: flagRow.entryId } });
  if (!entryRow) throw new SuggestError(`Time entry not found for flag: ${flagRow.entryId}`, 400);
  const entry = rowToEntry(entryRow);

  const ruleRow = await prisma.rule.findUnique({ where: { id: flagRow.ruleId }, include: { clause: true } });
  const clauseRow = ruleRow?.clause ?? (await prisma.clause.findUnique({ where: { id: flagRow.clauseId } }));
  const rulebookId = ruleRow?.rulebookId ?? clauseRow?.rulebookId ?? null;

  const activeRows = rulebookId
    ? await prisma.rule.findMany({ where: { rulebookId, status: "active" } })
    : [];
  const activeRules: Rule[] = activeRows
    .map((r) => {
      try {
        return r.dsl ? (JSON.parse(r.dsl) as Rule) : null;
      } catch {
        return null;
      }
    })
    .filter((r): r is Rule => !!r);
  // Ensure the flag's own rule is checked even if not active.
  if (ruleRow?.dsl && !activeRules.some((r) => r.id === ruleRow.id)) {
    try {
      activeRules.push(JSON.parse(ruleRow.dsl) as Rule);
    } catch {
      /* ignore */
    }
  }

  const user = [
    `GUIDELINE CLAUSE ${flagRow.clauseNumber}${clauseRow ? ` — ${clauseRow.title}` : ""}:`,
    clauseRow?.text ?? "(clause text unavailable)",
    ``,
    `VIOLATION (${flagRow.severity}): ${flagRow.ruleTitle} — ${flagRow.message}`,
    ``,
    `TIME ENTRY:`,
    JSON.stringify(
      {
        date: entry.date,
        timekeeper: entry.timekeeperName,
        role: entry.role,
        hours: entry.hours,
        rate: entry.rate,
        taskCode: entry.taskCode,
        activityCode: entry.activityCode,
        narrative: entry.narrative,
      },
      null,
      2,
    ),
  ].join("\n");

  let out: SuggestOut;
  try {
    out = await llmStructured<SuggestOut>({ name: "suggest_fix", schema: SuggestSchema, system: SYSTEM, user });
  } catch (err) {
    throw new SuggestError(`Suggestion failed: ${err instanceof Error ? err.message : String(err)}`, 502);
  }

  const suggestion: Suggestion = { explanation: out.explanation, verified: false };
  let replacements: TimeEntry[] | null = null;
  let hoursOk = true;

  if (out.splitEntries && out.splitEntries.length > 0) {
    const parts = out.splitEntries.map((s) => ({ ...s, hours: Math.max(0, round1(s.hours)) }));
    const sumExceptLast = parts.slice(0, -1).reduce((a, p) => a + p.hours, 0);
    parts[parts.length - 1].hours = round1(entry.hours - sumExceptLast);
    hoursOk =
      parts[parts.length - 1].hours > 0 &&
      Math.abs(parts.reduce((a, p) => a + p.hours, 0) - entry.hours) < 1e-6;
    replacements = parts.map((p, i) => ({
      ...entry,
      id: `${entry.id}_s${i + 1}`,
      narrative: p.narrative,
      hours: p.hours,
      taskCode: p.taskCode || entry.taskCode,
      activityCode: p.activityCode || entry.activityCode,
      amount: round2(p.hours * entry.rate),
    }));
    suggestion.splitEntries = replacements;
  } else if (out.narrative && out.narrative.trim()) {
    replacements = [{ ...entry, narrative: out.narrative.trim() }];
    suggestion.narrative = out.narrative.trim();
  }

  if (replacements) {
    const allRows = await prisma.timeEntry.findMany({
      where: { invoiceId: entry.invoiceId },
      orderBy: { ord: "asc" },
    });
    const records: EngineRecord[] = [];
    for (const r of allRows) {
      if (r.id === entry.id) records.push(...(replacements as unknown as EngineRecord[]));
      else records.push(rowToEntry(r) as unknown as EngineRecord);
    }
    const replacedIds = new Set(replacements.map((r) => r.id));
    const flags = checkRecords(activeRules, records);
    suggestion.verified = hoursOk && !flags.some((f) => replacedIds.has(f.entryId));
  }

  const updated = await prisma.flag.update({
    where: { id: flagId },
    data: { suggestion: JSON.stringify(suggestion) },
  });
  await logAudit({
    actor: "CounselLint",
    action: "flag.suggested",
    targetType: "flag",
    targetId: flagId,
    note: suggestion.verified ? "verified fix" : "unverified / explanation only",
  });
  return toFlag(updated);
}
