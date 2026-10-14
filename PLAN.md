# CounselLint — Build Plan

> **Every legal practice runs on a rulebook. We turn rulebooks into tested code.**

Corporate clients send law firms billing guidelines ("no block billing", "max 2 lawyers at a deposition", "travel at 50%"). Invoices that break them get rejected or cut. CounselLint compiles the guidelines into **tested, deterministic rules**, checks every time entry **before** the invoice goes out, explains each flag with the **exact clause**, and routes anything uncertain to a **human**.

---

## 1. What we are building (scope)

### P0 — must work for the demo
1. **Rulebook compiler** — paste guidelines → clauses → each clause compiled by the LLM into a typed rule + its own test cases → engine runs the tests → auto-repair loop (max 3 tries) → status badge.
2. **Judgment detection** — clauses like "time must be reasonable" are marked **Needs attorney interpretation** and never auto-enforced.
3. **Rule approval** — a rule is only active after an attorney clicks Approve (audit-logged).
4. **Invoice checker** — upload a CSV of time entries → run active rules → flagged rows with severity, $ impact, and the clause highlighted.
5. **Evaluation panel** — hand-labeled golden set → per-rule precision/recall shown on screen.
6. **Test suite** — Vitest, green, shown at the start of the demo.

### P1 — stretch, in this order
7. **Verified fix suggestions** — LLM rewrites a vague narrative / splits a block-billed entry; suggestion is re-run through the rules and only shown if it passes ✓.
8. **Second rulebook (USCIS H-1B checklist)** — same engine, different record type → proves the platform pitch.
9. **Review queue page** — uncertain rules + judgment clauses + dismissed flags with notes.

### P2 — after the hackathon
PDF ingestion, LEDES 1998B import/export, rule versioning & diffs, multi-client/multi-matter, auth/SSO, Postgres, integrations (Clio, Elite 3E, Aderant), client-side portal view.

---

## 2. Architecture

```
┌──────────────────────── Next.js (App Router, TypeScript) ────────────────────────┐
│                                                                                   │
│  FRONTEND (React + Tailwind + shadcn/ui)                                          │
│   /                 Dashboard        /rulebooks/[id]  Compile view (live stream)  │
│   /invoices/[id]    Check view       /review          Review queue   /eval        │
│                                                                                   │
│  BACKEND (Route Handlers under /app/api)                                          │
│   rulebooks · compile (SSE) · rules/approve · invoices · check · suggest · eval   │
│                                                                                   │
│  CORE LIBS (pure TypeScript, unit tested)                                         │
│   lib/engine    ← deterministic rule evaluator (NO LLM here)                      │
│   lib/compiler  ← segment → classify → compile → test → repair  (LLM here)        │
│   lib/llm       ← OpenAI client, structured outputs (zod → JSON schema), cache    │
└───────────────────────────────┬───────────────────────────────────────────────────┘
                                │
                    SQLite via Prisma (one-line swap to Postgres)
```

**Key design rule:** the LLM *writes* rules and *suggests* fixes. It never decides whether an entry is compliant. The engine does — same input, same answer, every time.

---

## 3. The rule format (heart of the system)

Rules are a small typed **AST** (safe, deterministic, diff-able, testable). No arbitrary code execution.

```ts
// lib/engine/types.ts
export type Field =
  | "date" | "timekeeperId" | "role" | "hours" | "rate" | "amount"
  | "taskCode" | "activityCode" | "narrative" | "matterId";

export type Op =
  | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "not_in"
  | "matches"            // regex (case-insensitive)
  | "contains_any"       // list of phrases
  | "word_count_lt"
  | "segment_count_gt"   // tasks split by ; or " and " / "&"
  | "not_multiple_of";   // e.g. hours not multiple of 0.1

export type Condition =
  | { all: Condition[] } | { any: Condition[] } | { not: Condition }
  | { field: Field; op: Op; value: unknown };

export type Aggregate = {
  groupBy: Field[];                                // e.g. ["date","activityCode"]
  fn: "count_distinct" | "sum" | "count";
  field: Field;                                    // e.g. "timekeeperId" / "hours"
  op: "gt" | "gte" | "lt" | "lte";
  value: number;
};

export type Rule = {
  id: string;
  clauseId: string;                                // traceability
  title: string;
  severity: "reject" | "reduce" | "warn";
  scope: "entry" | "group";
  when?: Condition;                                // which entries the rule applies to
  violation: Condition | Aggregate;                // true ⇒ flag
  adjustment?: { type: "rate_factor"; factor: number }; // e.g. travel 0.5
  message: string;                                 // human explanation template
};

export type RuleTest = {
  name: string;
  entries: Partial<TimeEntry>[];                   // 1 entry, or several for group rules
  expectFlagged: boolean;
};
```

`lib/engine/evaluate.ts` exposes:
- `evaluateRule(rule, entries) → Flag[]`
- `runTests(rule, tests) → { passed, failures[] }`
- `computeImpact(flag) → $` (reject = full amount, reduce = amount × (1 − factor))

---

## 4. Compiler pipeline (`lib/compiler`)

```
guideline text
   │ 1. segment   — regex on numbering (3.1, 3.2 …); LLM fallback. Keeps char offsets for highlighting.
   ▼
clauses[]
   │ 2. classify  — LLM structured output: { kind: "compilable" | "judgment" | "informational", reason }
   ▼
compilable clauses
   │ 3. compile   — LLM structured output: { rule: Rule, tests: RuleTest[] (≥2 pass, ≥2 fail) }
   ▼
   │ 4. validate  — zod parse (schema errors → repair) → runTests()
   ▼
   │ 5. repair    — on failure send {clause, rule, failing tests, actual vs expected} back; max 3 attempts
   ▼
status: VERIFIED | UNCERTAIN (failed after 3) | NEEDS_INTERPRETATION (judgment) → attorney Approve → ACTIVE
```

Every step emits an SSE event (`clause_found`, `classified`, `compiling`, `test_result`, `repairing`, `final_status`) so the UI animates live.

**LLM settings:** OpenAI Responses API, structured outputs with JSON schema from zod, model from `OPENAI_MODEL` env (use the strongest model you have access to, e.g. GPT-6.1 Sol), temperature low.

**Demo safety:** every LLM call is cached to `data/cache/*.json` keyed by prompt hash. `DEMO_REPLAY=1` replays cached results with realistic delays — the demo survives bad Wi-Fi. Tests also use these fixtures (offline, deterministic).

---

## 5. Data model (`prisma/schema.prisma`)

| Model | Key fields |
|---|---|
| `Client` | id, name (e.g. "Acme Corp") |
| `Rulebook` | id, clientId, title, sourceText, recordType (`time_entry` \| `h1b_petition`), version |
| `Clause` | id, rulebookId, number ("3.2"), text, start, end, kind, kindReason |
| `Rule` | id, clauseId, dsl (Json), status, attempts, approvedBy, approvedAt |
| `RuleTest` | id, ruleId, name, input (Json), expectFlagged, lastPassed |
| `Invoice` | id, clientId, matterId, period |
| `TimeEntry` | id, invoiceId, date, timekeeperId, timekeeperName, role, hours, rate, amount, taskCode, activityCode, narrative |
| `Flag` | id, entryId, ruleId, severity, message, impactUsd, status (open/accepted/dismissed), suggestion (Json), suggestionVerified |
| `GoldenLabel` | entryId, expectedRuleIds (Json) |
| `AuditLog` | id, actor, action, targetType, targetId, note, createdAt |

---

## 6. Backend API (`app/api/...`)

| Method & route | Does |
|---|---|
| `POST /api/rulebooks` | create from pasted text (or seeded file) |
| `GET  /api/rulebooks/:id` | rulebook + clauses + rules + tests |
| `POST /api/rulebooks/:id/compile` | **SSE stream** of the compiler pipeline |
| `POST /api/rules/:id/approve` | status → ACTIVE, audit log |
| `POST /api/rules/:id/recompile` | re-run compile for one clause |
| `POST /api/invoices` | upload CSV → parse → TimeEntries |
| `POST /api/invoices/:id/check` | run ACTIVE rules → Flags (pure engine) |
| `POST /api/flags/:id/suggest` | LLM fix → re-check with engine → `suggestionVerified` |
| `PATCH /api/flags/:id` | accept / dismiss (+ note) |
| `GET  /api/eval/:invoiceId` | compare flags vs GoldenLabel → precision/recall per rule |

---

## 7. Frontend screens

**1. Dashboard `/`**
Client card (Acme Corp) · rulebook status (6 clauses: 5 verified, 1 needs attorney) · last invoice: 20 entries, 6 flags, **$4,120 at risk** · buttons: Compile rulebook, Check invoice.

**2. Compile view `/rulebooks/[id]`** ← the "wow" screen
- Left: guideline text, each clause highlighted as it's found; color = status.
- Right: rule cards streaming in: `Compiling… → Testing 4/4 → ✗ 1 failed → Repairing (attempt 2) → ✓ Verified`.
- Expand card: rule JSON, test table (input, expected, actual, ✓/✗), **Approve** button.
- Judgment clause card: amber "Needs attorney interpretation — not auto-enforced" + reason.

**3. Invoice check `/invoices/[id]`**
- Table of entries; flagged rows red (reject) / amber (reduce/warn); totals: billed vs. at risk.
- Click a row → side panel: rule title, **clause quote highlighted**, explanation, $ impact, suggested fix with ✓ "verified against all rules" → Accept / Dismiss (note) / Send to review.

**4. Review queue `/review`**
Uncertain rules, judgment clauses, dismissed flags → approve / override / note. Audit trail at bottom.

**5. Eval `/eval`** (can be a tab on the invoice page)
Golden set: "14/15 entries correct". Per-rule precision/recall table. Mismatches listed.

---

## 8. Demo data (`data/`)

**`acme-ocg.md` — synthetic Acme Corp Outside Counsel Guidelines**
- 3.1 **Block billing** — each entry must describe one task; entries listing multiple tasks over 0.5 hrs are rejected.
- 3.2 **Vague narratives** — narratives under 5 words or using "attention to", "work on file", "review documents" (no subject) are rejected.
- 3.3 **Staffing** — no more than 2 timekeepers may bill for the same deposition or meeting.
- 3.4 **Travel** — non-working travel is billed at 50% of the standard rate.
- 3.5 **Clerical work** — filing, copying, scheduling, and document organization are not billable.
- 3.6 **Daily cap** — no timekeeper may bill more than 10 hours in a day on this matter.
- 3.7 **Reasonableness** — all time must be reasonable and necessary. ← *judgment clause*

**`invoice-oct.csv`** — 20 entries (LEDES-style columns, UTBMS codes like L120 / A101), seeded with ~6 violations, one per rule, plus 1–2 tricky near-misses (e.g. "travel to deposition and prepared outline" — travel + work).

**`golden.json`** — hand labels for 15 entries.

**`uscis-h1b.md` + `petition.json`** (P1) — 3 checklist rules on a synthetic petition:
- offered wage ≥ prevailing wage on the LCA
- worksite ZIP is listed on the certified LCA
- filing date is no more than 6 months before the requested start date

---

## 9. Folder structure

```
counsellint/
├─ app/
│  ├─ page.tsx                       # dashboard
│  ├─ rulebooks/[id]/page.tsx        # compile view
│  ├─ invoices/[id]/page.tsx         # check view (+ eval tab)
│  ├─ review/page.tsx
│  └─ api/… (routes from §6)
├─ components/  RuleCard, ClauseText, EntryTable, FlagPanel, StatusBadge, EvalTable
├─ lib/
│  ├─ engine/   types.ts, evaluate.ts, aggregate.ts, impact.ts
│  ├─ compiler/ segment.ts, classify.ts, compile.ts, repair.ts, prompts.ts, pipeline.ts
│  ├─ llm.ts    # OpenAI client + structured outputs + cache/replay
│  ├─ csv.ts    # invoice parsing
│  └─ db.ts
├─ prisma/  schema.prisma, seed.ts
├─ data/    acme-ocg.md, invoice-oct.csv, golden.json, uscis-h1b.md, petition.json, cache/
├─ tests/   engine.test.ts, compiler.test.ts (fixtures), golden.test.ts
└─ README.md  # problem, architecture diagram, how to run, responsible-use notes
```

**Stack:** Next.js 15 · TypeScript · Tailwind + shadcn/ui · Prisma + SQLite · OpenAI SDK · zod · Vitest · papaparse.

---

## 10. Tests (what "a small set of tests" means here)

- **engine.test.ts** — every operator, all/any/not, group aggregates, travel adjustment, $ impact. Pure, fast.
- **compiler.test.ts** — with cached LLM fixtures: compile produces schema-valid rules; repair loop fixes a deliberately broken rule; judgment clause → NEEDS_INTERPRETATION.
- **golden.test.ts** — full pipeline on `invoice-oct.csv` matches `golden.json` above a threshold.

---

## 11. Build order (tonight, ~80 min)

| Time | Build | Done when |
|---|---|---|
| 0–10 | Scaffold Next.js + Prisma + Tailwind; write `data/` files | app boots, seed runs |
| 10–25 | `lib/engine` + `engine.test.ts` | tests green |
| 25–45 | `lib/compiler` + `llm.ts` (structured outputs, cache) + SSE route | 7 clauses → 6 rules + 1 judgment, with repair |
| 45–60 | Compile view + Approve | live streaming cards |
| 60–70 | Invoice check view + flag panel + eval tab | 6 flags, clause highlight, accuracy shown |
| 70–75 | P1: verified fix suggestion **or** USCIS swap | — |
| 75–80 | Freeze. Record cache (`DEMO_REPLAY`). Rehearse. | — |

**Parallelize with Codex `/agents`:** Agent A builds the engine and its tests · Agent B builds the compiler, LLM client and SSE route · Agent C builds the UI against mocked API responses. Merge at minute 45.

---

## 12. Demo script (3 min)

1. **Story (20s):** billing coordinator rewriting entries every Friday; firms write off six figures a year to rejected invoices.
2. **Tests green** in terminal (5s).
3. **Compile Acme's guidelines live:** clauses light up, one rule fails a test → repairs → ✓. Clause 3.7 turns amber: *"We deliberately don't automate judgment."*
4. **Approve rules → check October invoice:** 6 flags, $4,120 at risk. Click one → clause 3.1 highlighted → accept verified fix.
5. **Eval tab:** 14/15 on the golden set.
6. **Swap to the USCIS rulebook:** same engine flags a wage-below-prevailing petition.
7. **Close:** *"Every practice runs on a rulebook. We turn rulebooks into tested code."*

---

## 13. Responsible use (one slide / README section)

- Synthetic data only; no client information.
- The LLM never makes the final compliance call; deterministic code does.
- Every rule is tested and attorney-approved before use; every flag traces to a clause.
- Judgment clauses are never auto-enforced.
- Production path: zero data retention, audit log, per-client isolation, SSO.
