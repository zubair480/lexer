# Backend internal interfaces (B1-owned, read-only for everyone else)

These are the function signatures BETWEEN backend lanes. Code against them exactly so lanes merge
without edits. Contract types come from `@/shared/contract`. Engine-internal types from `@/lib/engine/types`.
Stack facts: Next.js 15 App Router (route `params` is a **Promise**: `{ params }: { params: Promise<{ id: string }> }` → `const { id } = await params`),
Prisma **6** + SQLite, zod **3** (`import { z } from "zod"`), `zod-to-json-schema`, openai SDK (Responses API), vitest, papaparse, Windows dev machine.
Path alias `@/*` → repo root. Data files: `path.join(process.cwd(), "data", ...)`.

## Deterministic IDs (so re-runs, cache and frontend agree)
- Clause id: `${rulebookId}__${number}` e.g. `rb_acme_ocg__3.1`
- CompiledRule id == Rule.id: `rule_${clauseId}` e.g. `rule_rb_acme_ocg__3.1`
- Flag id: `flag_${invoiceId}__${entryId}__${ruleId}`
- Audit ids / others: `nanoid()`

## lib/engine (PURE — no I/O, no Date.now(), no LLM)
`lib/engine/types.ts` (B1, already written): `EngineRecord`, `EngineFlag`, `isAggregate()`.
- **B2 `lib/engine/ops.ts`**
  - `getField(record: EngineRecord, field: Field): unknown` — includes derived `daysBeforeStart` = days from filingDate to requestedStartDate (UTC date diff, integer) when not present on record.
  - `applyOp(op: Op, actual: unknown, value: unknown, record: EngineRecord): boolean`
  - `segmentCount(text: string): number` — split on `;`, ` and `, `&`, `,` (case-insensitive), count non-empty trimmed parts.
- **B2 `lib/engine/evaluate.ts`**
  - `evalCondition(cond: Condition, record: EngineRecord): boolean`
  - `appliesTo(rule: Rule, record: EngineRecord): boolean` — `when` absent ⇒ true
  - `evaluateEntryRule(rule: Rule, records: EngineRecord[]): EngineFlag[]`
- **B3 `lib/engine/aggregate.ts`**: `evaluateGroupRule(rule: Rule, records: EngineRecord[]): EngineFlag[]`
  — filter by `appliesTo`, group by `groupBy` key, compute fn over `field`, compare; flag EVERY record in each violating group.
- **B3 `lib/engine/impact.ts`**: `computeImpact(rule: Rule, record: EngineRecord): number`
  — reject ⇒ amount; reduce ⇒ amount × (1 − adjustment.factor) (no adjustment ⇒ amount); warn ⇒ 0. amount = record.amount ?? hours×rate ?? 0. Round to cents.
- **B3 `lib/engine/index.ts`** (public API; everyone imports from `@/lib/engine`):
  - re-export everything above + types
  - `evaluateRule(rule: Rule, records: EngineRecord[]): EngineFlag[]` (dispatch on `isAggregate(rule.violation)` / scope)
  - `runTests(rule: Rule, tests: RuleTest[]): TestResult[]` — actualFlagged = evaluateRule(rule, test.records with auto ids `t0,t1..` if missing).length > 0
  - `checkRecords(rules: Rule[], records: EngineRecord[]): EngineFlag[]` — all rules, stable order (records order, then rules order)

## lib/server/llm.ts (B5)
```ts
export async function llmStructured<T>(opts: {
  name: string;               // schema name, e.g. "classify_clause"
  schema: z.ZodType<T>;       // validated after the call
  system: string;
  user: string;
}): Promise<T>;
export function setLlmOverride(fn: ((opts: {name:string; system:string; user:string}) => Promise<unknown>) | null): void; // tests
export function llmAvailable(): boolean; // key present OR DEMO_REPLAY=1
```
Cache key = sha256(JSON.stringify({model, name, system, user})) → `data/cache/<key>.json` = `{ name, model, output }`.
Cache hit ⇒ return (with 300–900ms delay if `DEMO_REPLAY=1`, no delay otherwise). Miss + no key ⇒ throw `Error("LLM unavailable: ...")`.
Throws `LlmValidationError` (exported, has `.raw` and `.issues`) when output fails zod — compiler treats it like a failed attempt.

## lib/compiler (B6, B7, B8)
- **B6 `segment.ts`**: `segmentRulebook(rulebookId: string, sourceText: string): Promise<Clause[]>` (no kind). Regex on `### <num> <title>` headings; `start/end` = offsets of the clause BODY text (trimmed) in sourceText so `sourceText.slice(start,end) === text`. LLM fallback only if 0 headings found.
- **B6 `classify.ts`**: `classifyClause(clause: Clause, recordType: RecordType): Promise<{ kind: ClauseKind; reason: string }>` — LLM; on LLM failure fall back to keyword heuristic (reasonable/necessary/appropriate/excessive-without-number ⇒ judgment).
- **B7 `schemas.ts`**: zod `RuleSchema`, `RuleTestSchema`, `ConditionSchema` (z.lazy), `AggregateSchema`, `CompileOutputSchema = { rule, tests }`.
- **B7 `compile.ts`**:
```ts
export type CompileProgress =
  | { kind: "status"; status: "compiling" | "testing" | "repairing"; attempt: number }
  | { kind: "tests"; attempt: number; results: TestResult[] };
export async function compileClause(clause: Clause, recordType: RecordType,
  onProgress?: (p: CompileProgress) => void): Promise<{
  status: "verified" | "uncertain"; attempts: number; rule: Rule | null; tests: RuleTest[]; testResults: TestResult[];
}>;
```
  Force `rule.id = "rule_" + clause.id`, `rule.clauseId = clause.id`, `rule.recordType = recordType`. Max 3 attempts. Also requires ≥2 expectFlagged=true and ≥2 false tests (else counts as failure → repair).
- **B7 `repair.ts`**: `repairRule(input: { clause; recordType; rule: Rule | null; tests: RuleTest[]; failures: TestResult[]; error?: string }): Promise<{ rule: Rule; tests: RuleTest[] }>` — repair may fix the rule OR a wrong test, but must keep ≥2/≥2.
- **B8 `pipeline.ts`**: `runCompilePipeline(rulebookId: string, emit: (e: CompileEvent) => void): Promise<void>` — persists every state change to DB, concurrency 4, never throws (errors ⇒ `error` event), always ends with `done`.

## lib/server (B8, B9, B10, B11)
- **B1 `db.ts`**: `export const prisma` (singleton).
- **B8 `rulebooks.ts`**: `getRulebook(id): Promise<Rulebook | null>`, `listRulebookSummaries(): Promise<RulebookSummary[]>`, `toCompiledRule(row): CompiledRule`, `getActiveRules(rulebookId): Promise<Rule[]>`.
- **B9 `seed.ts`**: `seedDemo(prisma: PrismaClient): Promise<void>` — wipes ALL tables then seeds. `prisma/seed.ts` just calls it. Also `loadPetitions(): H1BPetition[]`, `loadGolden(): Record<string,string[]>`.
- **B10 `csv.ts`**: `parseInvoiceCsv(csv: string, invoiceId: string): TimeEntry[]`.
- **B10 `invoices.ts`**: `getInvoice(id): Promise<Invoice | null>`, `computeTotals(entries, flags): InvoiceTotals` (atRisk = sum impactUsd of flags with status != "dismissed", flaggedCount = distinct entryIds), `getFlags(invoiceId): Promise<Flag[]>`, `toFlag(row): Flag`.
- **B11 `audit.ts`**: `logAudit(e: { actor: string; action: string; targetType: string; targetId: string; note?: string }): Promise<void>` (B11 owns; others import).
- **B11 `eval.ts`**: `evaluateInvoice(invoiceId): Promise<EvalResult>`; **`suggest.ts`**: `suggestFix(flagId): Promise<Flag>`.

## Prisma schema (B1, `prisma/schema.prisma`) — JSON stored as String columns
Client(id,name) · Rulebook(id,clientId,title,recordType,sourceText,version,createdAt) ·
Clause(id,rulebookId,number,title,text,start,end,kind?,kindReason?,ord) ·
Rule(id,clauseId,rulebookId,status,attempts,dsl String?,tests String,testResults String,approvedBy?,approvedAt?,updatedAt) ·
Invoice(id,clientId,matterId,period,recordType) ·
TimeEntry(id,invoiceId,ord,date,timekeeperId,timekeeperName,role,hours,rate,amount,taskCode,activityCode,narrative,matterId) ·
Flag(id,invoiceId,entryId,ruleId,clauseId,clauseNumber,ruleTitle,severity,message,impactUsd,status,note?,suggestion String?,createdAt) ·
AuditLog(id,actor,action,targetType,targetId,note?,createdAt)

## H-1B (P1)
Check route: if the rulebook's recordType is `h1b_petition`, records = `loadPetitions()` (entryId = petition id); invoiceId param is still used for Flag.invoiceId.
