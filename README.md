# CounselLint

> **Every legal practice runs on a rulebook. We turn rulebooks into tested code.**

CounselLint compiles a client's outside counsel billing guidelines into **tested, deterministic rules**, checks every time entry **before** the invoice goes out, explains each flag with the **exact clause**, and routes anything uncertain to a **human**.

## The problem

Corporate clients send law firms billing guidelines: *"no block billing"*, *"max 2 timekeepers at a deposition"*, *"travel at 50%"*. Invoices that break them get rejected or cut by e-billing reviewers. Today a billing coordinator rewrites entries by hand every Friday, and firms still write off large sums every year to rejected time. The guidelines are prose; the invoices are data. Nothing connects them until the client says no.

## How it works

```
 compile ─▶ test ─▶ repair ─▶ attorney approve ─▶ check ─▶ explain ─▶ verified fix
```

1. **Compile.** Paste the guidelines. They are split into numbered clauses (with character offsets for highlighting), each classified as `compilable`, `judgment` or `informational`. The LLM turns each compilable clause into a typed rule (JSON AST) **plus its own test cases** (at least 2 should-flag, 2 should-pass).
2. **Test.** The deterministic engine runs those tests against the rule.
3. **Repair.** Failing tests (expected vs actual) go back to the LLM; max 3 attempts. Result: `verified` or `uncertain` (sent to human review).
4. **Attorney approve.** A rule is used only after an attorney clicks Approve (audit-logged). Judgment clauses ("time must be reasonable") become `needs_interpretation` and are **never auto-enforced**.
5. **Check.** Upload a time-entry CSV. Only `active` rules run, in the engine, with no LLM involved.
6. **Explain.** Each flag shows severity, $ impact and the clause text it came from.
7. **Verified fix.** The LLM proposes a rewrite or a split of a block-billed entry. The proposal is re-checked against **all** active rules and is marked verified only if it passes.

## Architecture

```
┌──────────────────────────────── Next.js 15 (App Router) ───────────────────────────────┐
│  UI pages: dashboard · compile view (live SSE) · invoice check · eval · review/audit   │
│                                                                                         │
│  app/api/*   rulebooks · compile/stream (SSE) · rules/approve · invoices/check ·        │
│              flags/suggest · eval · review · audit · demo/reset                         │
└───────────────┬──────────────────────────────────────────────┬──────────────────────────┘
                │                                              │
   ┌────────────▼─────────────┐                    ┌───────────▼─────────────┐
   │ lib/compiler  (LLM)      │  rule + tests      │ lib/engine (NO LLM)     │
   │ segment → classify →     │ ─────────────────▶ │ deterministic evaluator │
   │ compile → repair         │ ◀───────────────── │ ops · aggregates ·      │
   │ lib/server/llm.ts:       │   test results     │ impact · runTests       │
   │ OpenAI structured output │                    │ same input = same flags │
   │ + cache (data/cache)     │                    └───────────┬─────────────┘
   └────────────┬─────────────┘                                │
                └──────────────────┬───────────────────────────┘
                       SQLite via Prisma (one-line swap to Postgres)
```

**Key design rule:** the LLM *writes* rules and *suggests* fixes. It never decides whether an entry is compliant; `lib/engine` does.

## The rule DSL

Rules are a small typed AST (`shared/contract.ts`). There is no arbitrary code execution, and every rule can be diffed and tested.

- `scope: "entry"` rules evaluate a `Condition` per record. Conditions can be combined with `all` / `any` / `not` and use these operators: `eq neq gt gte lt lte in not_in matches contains_any word_count_lt segment_count_gt not_multiple_of gt_field lt_field not_in_field`.
- `scope: "group"` rules use an `Aggregate` (`groupBy` + `count_distinct | sum | count`) for checks like staffing limits and daily caps.
- `when` sets which records a rule applies to. `adjustment: { type: "rate_factor", factor }` handles cases like travel billed at 50%.
- Severity sets the $ impact. For `reject` it is the full amount, for `reduce` it is amount × (1 − factor), and for `warn` it is $0.

Example (clause 3.1, block billing):

```json
{
  "id": "rule_rb_acme_ocg__3.1",
  "clauseId": "rb_acme_ocg__3.1",
  "title": "Block billing",
  "severity": "reject",
  "scope": "entry",
  "recordType": "time_entry",
  "when": { "field": "hours", "op": "gt", "value": 0.5 },
  "violation": { "field": "narrative", "op": "segment_count_gt", "value": 1 },
  "message": "Entry lists multiple tasks in one time entry (block billing)."
}
```

## API

All routes return JSON matching `shared/contract.ts`. Errors are `{ "error": string }`.

| Method | Route | Returns |
|---|---|---|
| GET | `/api/dashboard` | `DashboardSummary` |
| GET / POST | `/api/rulebooks` | `RulebookSummary[]` / `Rulebook` (body `CreateRulebookReq`) |
| GET | `/api/rulebooks/:id` | `Rulebook` |
| GET | `/api/rulebooks/:id/compile/stream` | `text/event-stream` of `CompileEvent` |
| POST | `/api/rules/:id/approve` | `CompiledRule` (body `ApproveRuleReq`) |
| POST | `/api/rulebooks/:id/approve-all` | `Rulebook` (approves all `verified`) |
| POST | `/api/rules/:id/recompile` | `CompiledRule` |
| GET / POST | `/api/invoices` | `InvoiceSummary[]` / `Invoice` (body `CreateInvoiceReq`, CSV) |
| GET | `/api/invoices/:id` | `Invoice` |
| POST | `/api/invoices/:id/check` | `InvoiceCheckResult` (body `CheckInvoiceReq`) |
| GET | `/api/invoices/:id/flags` | `Flag[]` |
| POST | `/api/flags/:id/suggest` | `Flag` with verified `suggestion` |
| PATCH | `/api/flags/:id` | `Flag` (body `UpdateFlagReq`: accept / dismiss + note) |
| GET | `/api/eval/:invoiceId` | `EvalResult` (per-rule precision/recall vs golden set) |
| GET | `/api/review` | `ReviewItem[]` |
| GET | `/api/audit` | `AuditEntry[]` |
| POST | `/api/demo/reset` | `{ ok: true }` (re-seeds demo data) |

## Run it (Windows / macOS)

Requires Node.js 20 or later.

```bash
npm install
cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env
#   then set OPENAI_API_KEY and OPENAI_MODEL in .env
npx prisma db push            # create the SQLite schema
npm run seed                  # Acme client, rulebooks (uncompiled), October invoice, golden labels
npm run dev                   # http://localhost:3000
npm test                      # Vitest: engine, compiler (cached fixtures), golden set
npm run demo                  # DEMO_REPLAY=1: replays recorded LLM calls from data/cache, works offline
```

`npm run demo` needs no API key if `data/cache/` holds the recorded calls. The demo still runs on bad Wi-Fi.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | for live compile / suggest | OpenAI key (Responses API, structured outputs) |
| `OPENAI_MODEL` | for live compile / suggest | Model name; use the strongest available |
| `DEMO_REPLAY` | no (default `0`) | `1` = serve LLM calls from `data/cache/` with realistic 300–900 ms delays |
| `DATABASE_URL` | yes | SQLite file, default `file:./dev.db` |

## Demo script (3 min)

1. **Story (20s):** a billing coordinator rewrites entries every Friday, and firms still write off large sums to rejected invoices.
2. **Tests green** in the terminal (`npm test`).
3. **Compile Acme's guidelines live:** clauses light up as they are found. One rule fails a test, repairs itself and turns ✓. Clause 3.7 turns amber: *"We deliberately don't automate judgment."*
4. **Approve rules, then check the October invoice:** 6 flags and about $4,120 at risk. Click one to see clause 3.1 highlighted, then accept the verified fix.
5. **Eval tab:** 14/15 correct on the golden set.
6. **Swap to the USCIS H-1B rulebook:** the same engine flags a petition whose offered wage is below the prevailing wage.
7. **Close:** *"Every practice runs on a rulebook. We turn rulebooks into tested code."*

## Responsible use

- **Synthetic data only.** Acme Corp, its guidelines, invoices and H-1B petitions are made up. No client information is used.
- **The LLM never makes the compliance call.** Deterministic code in `lib/engine` does: same input, same answer, every time.
- **Every rule is tested and attorney-approved** before it touches an invoice. A rule that fails its own tests after 3 repairs is marked `uncertain` and goes to human review.
- **Judgment clauses are never auto-enforced.** "Reasonable and necessary" stays with a lawyer.
- **Every flag traces to a clause**, with the source text highlighted.
- **Audit log.** Approvals, dismissals (with notes) and compiles are recorded with actor and timestamp.
- **Fix suggestions are only marked verified** once they pass every active rule. Accepting a fix is always a human decision.
- **Production path:** zero-data-retention LLM endpoints, per-client data isolation, SSO, and the same audit trail backed by Postgres.

## Roadmap (P2)

- PDF ingestion of guideline documents
- LEDES 1998B import / export
- Rule versioning and diffs when a client updates its guidelines
- Multi-client / multi-matter workspaces
- Auth / SSO, Postgres
- Integrations: Clio, Elite 3E, Aderant
- Client-side portal view of pre-checked invoices

## Stack

Next.js 15 · TypeScript · Tailwind + shadcn/ui · Prisma + SQLite · OpenAI SDK (Responses API, structured outputs) · zod · Vitest · papaparse
# lexer
