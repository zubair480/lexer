import { z } from "zod";
import type { Clause, ClauseKind, RecordType } from "@/shared/contract";
import { llmStructured } from "@/lib/server/llm";

const FIELDS: Record<RecordType, string> = {
  time_entry:
    "date (YYYY-MM-DD), timekeeperId, role (partner|associate|paralegal), hours (number), rate (USD/hour), amount (USD), " +
    "taskCode (UTBMS e.g. L120), activityCode (UTBMS e.g. A101, A109=attend meeting/deposition), narrative (free text), matterId",
  h1b_petition:
    "offeredWage (USD/yr), lcaPrevailingWage (USD/yr), worksiteZip, lcaWorksiteZips (string[]), filingDate (YYYY-MM-DD), " +
    "requestedStartDate (YYYY-MM-DD), daysBeforeStart (derived integer: days from filingDate to requestedStartDate)",
};

const ClassifySchema = z.object({
  kind: z.enum(["compilable", "judgment", "informational"]),
  reason: z.string(),
});

const SYSTEM = `You triage clauses of legal guidelines (outside-counsel billing guidelines, regulatory requirements) before they are compiled into executable checks over structured records.

Classify the clause as exactly one of:
- "compilable": an objective obligation that can be checked MECHANICALLY against the record fields listed below — thresholds, keywords/phrases, codes, rates or percentages, counts, dates/day limits, lists of prohibited task types. If a machine could decide pass/fail from the fields alone (even approximately, e.g. by keyword matching on the narrative), it is compilable.
- "judgment": requires human discretion with no objective test — e.g. "reasonable", "necessary", "appropriate", "excessive", "customary" WITHOUT a number or concrete criterion. Such clauses must never be auto-enforced.
- "informational": imposes no checkable obligation — definitions, contacts, purpose statements, scope, submission logistics that are not in the record.

reason: ONE short plain-English sentence for an attorney explaining the classification (mention the threshold/keyword/code when compilable, or the discretionary word when judgment).`;

const JUDGMENT_WORDS =
  /\b(reasonabl[ey]|unreasonabl[ey]|necessary|unnecessary|appropriate|inappropriate|excessive|customary|adequate|sufficient|prudent|duplicative|efficient(?:ly)?|in good faith|discretion|proportionate)\b/i;
const NUMBER_HINT =
  /\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|half|twice|double|percent|hours?|days?)\b/i;
const OBLIGATION_WORDS =
  /\b(must|shall|will be|will not|may not|not (?:be )?(?:billable|permitted|allowed|reimbursable)|no more than|more than|less than|fewer than|at least|not exceed|exceed(?:s|ing)?|no \w+ may|may (?:only|bill)|not billable|required|prohibited|rejected|disallowed|only|never|billed at)\b/i;

export function heuristicClassify(clause: Pick<Clause, "number" | "title" | "text">): { kind: ClauseKind; reason: string } {
  const text = `${clause.title}. ${clause.text}`;
  const judgment = text.match(JUDGMENT_WORDS);
  if (judgment && !NUMBER_HINT.test(clause.text)) {
    return {
      kind: "judgment",
      reason: `Turns on "${judgment[0].toLowerCase()}" with no objective threshold, so it needs attorney discretion (heuristic).`,
    };
  }
  if (!OBLIGATION_WORDS.test(text)) {
    return { kind: "informational", reason: "States no checkable obligation on billed records (heuristic)." };
  }
  return {
    kind: "compilable",
    reason: "States an objective requirement that can be checked against record fields (heuristic).",
  };
}

export async function classifyClause(
  clause: Clause,
  recordType: RecordType,
): Promise<{ kind: ClauseKind; reason: string }> {
  try {
    const user =
      `Record type: ${recordType}\nRecord fields: ${FIELDS[recordType] ?? FIELDS.time_entry}\n\n` +
      `Clause ${clause.number} — ${clause.title}\n"""\n${clause.text}\n"""\n\n` +
      `Return JSON {"kind": "compilable"|"judgment"|"informational", "reason": "<one sentence>"}.`;
    const out = await llmStructured({ name: "classify_clause", schema: ClassifySchema, system: SYSTEM, user });
    const reason = out.reason.trim() || heuristicClassify(clause).reason;
    return { kind: out.kind, reason };
  } catch {
    return heuristicClassify(clause);
  }
}
