# BACKEND SESSION PROMPT — CounselLint

You are the **BACKEND LEAD (B1)** of a hackathon team building **CounselLint** in the folder `Codex Law Hackathon/` (your current working directory). A separate FRONTEND session with its own agent team works in the same folder at the same time. Demo is at **8:00 PM**; code freeze **7:50 PM**. Speed matters, but correctness matters more: every endpoint must return exactly what `shared/contract.ts` says.

## 0. Read first (in this order, before spawning anyone)
1. `PLAN.md` — product, architecture, rule DSL, compiler pipeline, demo script.
2. `shared/contract.ts` — **the contract**. Every type, route, SSE event and demo ID. Code against it exactly.
3. `COORDINATION.md` — file ownership, status board, request protocol, npm lock, scaffold gate.
4. `.coord/*` — board, requests, api-status, contract changelog.

## 1. What CounselLint is (one paragraph)
Corporate clients give law firms billing guidelines ("no block billing", "max 2 timekeepers at a deposition", "travel at 50%"). CounselLint **compiles each guideline clause into a typed rule (JSON AST) plus its own test cases using an LLM**, runs the tests in a **deterministic engine**, **auto-repairs** failing rules (max 3 attempts), marks judgment clauses ("time must be reasonable") as **needs_interpretation** (never auto-enforced), requires **attorney approval** before a rule is active, then **checks invoices** and explains every flag with the exact clause. **The LLM never decides compliance — `lib/engine` does.**

## 2. Agent team — spawn AT LEAST 12 parallel agents (more is better: use B13–B16 if your tool allows)
Spawn them all at once in parallel, as background sub-agents in this same folder (Claude Code: Agent tool; Codex: `/agents`). Give each agent: its ID, its lane below, the paths it owns, and the instruction to **read PLAN.md, shared/contract.ts and COORDINATION.md first** and to **log START/BLOCKED/DONE to `.coord/board.md`**.

| ID | Lane | Owns | Definition of done |
|---|---|---|---|
| **B1 (you)** | Lead, scaffold, integration | `package.json`, lockfile, configs, `prisma/**`, `lib/server/db.ts`, `shared/contract.ts` | Scaffold done in ≤5 min; all lanes merged; `npm run build` + `npm test` pass; all endpoints LIVE |
| **B2** | Engine: conditions & operators | `lib/engine/evaluate.ts`, `lib/engine/ops.ts` | Every `Op` in the contract implemented for entry-scope rules; `when` filtering; returns `Flag`-shaped results |
| **B3** | Engine: aggregates, adjustments, impact | `lib/engine/aggregate.ts`, `lib/engine/impact.ts`, `lib/engine/index.ts` | Group rules (`groupBy` + count_distinct/sum/count); `rate_factor` adjustment; `impactUsd` (reject=amount, reduce=amount×(1−factor), warn=0); `runTests(rule, tests) → TestResult[]`; H1B derived field `daysBeforeStart` |
| **B4** | Engine tests (TDD, start immediately from the contract) | `tests/engine.test.ts`, `vitest.config.ts` | ≥25 tests covering every operator, all/any/not, aggregates, impact, travel, H1B rules |
| **B5** | LLM client | `lib/server/llm.ts` | OpenAI Responses API with **structured outputs** (JSON schema built from zod); model from `OPENAI_MODEL`, key from `OPENAI_API_KEY`; **cache** every call to `data/cache/<sha256>.json`; `DEMO_REPLAY=1` serves cache with 300–900ms delays; retries on 429/5xx |
| **B6** | Compiler: segment + classify | `lib/compiler/segment.ts`, `lib/compiler/classify.ts` | Regex segmentation on numbering (`3.1 Title — text`), keeps char offsets `start/end` into sourceText, LLM fallback; classify → `compilable / judgment / informational` + reason |
| **B7** | Compiler: compile + repair + prompts | `lib/compiler/compile.ts`, `lib/compiler/repair.ts`, `lib/compiler/prompts.ts`, `lib/compiler/schemas.ts` (zod mirrors of contract Rule/RuleTest) | Clause → `{ rule, tests (≥2 should-flag, ≥2 should-pass) }`; validate with zod; run tests via engine; on failure send clause + rule + failing tests (expected vs actual) back to LLM; max 3 attempts → `verified` or `uncertain` |
| **B8** | Pipeline + rulebook/rule routes + SSE | `lib/compiler/pipeline.ts`, `app/api/rulebooks/**`, `app/api/rules/**` | `GET /api/rulebooks/:id/compile/stream` emits every `CompileEvent` in order (`started → clause_found* → classified* → rule_status* → test_results* → rule_compiled* → done`), compiles clauses **in parallel** (concurrency 4); approve, approve-all, recompile, list, get, create |
| **B9** | Demo data + seed + reset | `data/acme-ocg.md`, `data/invoice-oct.csv`, `data/golden.json`, `data/uscis-h1b.md`, `data/petitions.json`, `prisma/seed.ts` (coordinate with B1), `app/api/demo/reset/**` | See §5. Seed creates client, both rulebooks (uncompiled), the invoice with 20 entries, golden labels. Reset re-seeds |
| **B10** | Invoice routes | `lib/server/csv.ts`, `app/api/invoices/**`, `app/api/flags/[id]/route.ts` (PATCH), `app/api/dashboard/**` | CSV → TimeEntry[] (papaparse); check runs only `active` rules via engine → persists Flags; totals; PATCH writes audit log; dashboard summary |
| **B11** | Suggest + eval + review + audit | `app/api/flags/[id]/suggest/**`, `app/api/eval/**`, `app/api/review/**`, `app/api/audit/**`, `lib/server/suggest.ts`, `lib/server/eval.ts` | Suggest: LLM rewrites narrative or splits block-billed entry (split hours must sum to original) → re-run **all active rules** → `verified` true only if clean. Eval: compare flags vs `golden.json` (clause numbers) → `EvalResult`. Review: uncertain rules + judgment clauses + dismissed flags |
| **B12** | QA + contract conformance + demo cache | `tests/compiler.test.ts`, `tests/golden.test.ts`, `tests/api.smoke.ts` | Compiler tests run offline on cached fixtures; golden test ≥ 14/15; smoke-test every endpoint with curl against `shared/contract.ts` shapes; flips rows in `.coord/api-status.md` to LIVE; records full demo cache (run compile once live, then verify `DEMO_REPLAY=1` works) |
| B13 (optional) | Second QA: adversarial clauses & entries | `tests/adversarial.test.ts` | Near-miss entries don't false-flag (e.g. "travel to deposition; prepared outline") |
| B14 (optional) | USCIS rulebook end-to-end | (with B9/B3) | USCIS rulebook compiles to 3 verified rules and flags the bad petition |
| B15 (optional) | Performance & resilience | — | Compile of 7 clauses < 40s live; errors become `error` events, never crash the stream |
| B16 (optional) | README + responsible-use | `README.md` (backend sections) | How to run, architecture diagram, env vars, responsible use |

## 3. Your first 5 minutes as B1 (others start writing pure TS in parallel; they must not run npm until the gate opens)
1. Scaffold Next.js into a temp folder and move it in (the root isn't empty):
   `npx create-next-app@15 _scaffold --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --yes`
   then move everything from `_scaffold/` to the root **without overwriting** `PLAN.md`, `COORDINATION.md`, `shared/`, `.coord/`, `prompts/`; delete `_scaffold/`. Delete the default `app/page.tsx` (frontend owns pages under `app/(app)/`).
2. Take `.coord/locks/npm.lock`, then install in ONE command:
   `npm i openai zod zod-to-json-schema @prisma/client papaparse nanoid` and `npm i -D prisma vitest @types/papaparse tsx`
   Also install the frontend's base deps now so they don't need a second install: `npm i lucide-react clsx tailwind-merge class-variance-authority`. Release the lock.
3. `prisma/schema.prisma` with SQLite (`file:./dev.db`) and the models in PLAN.md §5 (store DSL/tests/suggestions as `String` JSON columns since SQLite). `npx prisma db push`. `lib/server/db.ts` exports a singleton PrismaClient.
4. `package.json` scripts: `dev`, `build`, `test` (`vitest run`), `seed` (`tsx prisma/seed.ts`), `demo` (`DEMO_REPLAY=1 next dev`).
5. `.env.example`: `OPENAI_API_KEY=`, `OPENAI_MODEL=`, `DEMO_REPLAY=0`, `DATABASE_URL="file:./dev.db"`. Ask the user to put their key in `.env` (never print it).
6. Create `.coord/SCAFFOLD_DONE`, log it on the board, and tell the frontend in `.coord/requests.md`.

## 4. Key technical requirements
- **Contract fidelity:** route handlers return exactly the contract types. Import types from `@/shared/contract`. Errors: `{ error: string }` with proper status codes.
- **SSE:** `GET` route returning `new Response(ReadableStream)` with `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`; each event `data: ${JSON.stringify(event)}\n\n`; `export const dynamic = "force-dynamic"` and `runtime = "nodejs"`. Persist rule state to DB as it changes so a page refresh shows the current state.
- **Determinism:** `lib/engine` is pure (no I/O, no LLM, no Date.now()). Same input → same output.
- **Segmentation format** of guideline files: `### 3.1 Block billing` header line, then the clause text paragraph(s). `Clause.start/end` must point at the clause text inside `Rulebook.sourceText` so the frontend can highlight it.
- **Compile prompt essentials** (B7): give the model the full DSL spec (copy the types from the contract), the TimeEntry field list with example values, 2 worked examples (one entry rule, one group rule), and require: tests must be realistic TimeEntry records; group-rule tests must contain multiple records; `message` must reference the clause number.
- **Classification prompt** (B6): "judgment" = requires human discretion (reasonable, necessary, appropriate, excessive without a number); "informational" = definitions/contacts/no obligation.
- **Concurrency:** compile clauses with `Promise.all` limited to 4. Stream events as each finishes.
- **Audit:** approve, approve-all, flag accept/dismiss, compile complete → `AuditEntry`.
- **Seeded IDs** must match `DEMO` in the contract exactly.

## 5. Demo data spec (B9)
**`data/acme-ocg.md`** — "Acme Corp Outside Counsel Billing Guidelines (synthetic)". A short intro paragraph (informational, no number), then:
- `### 3.1 Block billing` — Each time entry must describe a single task. Entries that combine multiple tasks and exceed 0.5 hours will be rejected.
- `### 3.2 Vague narratives` — Narratives must be specific. Entries under five words, or using "attention to", "work on file", or "review documents" without identifying the subject, will be rejected.
- `### 3.3 Staffing` — No more than two timekeepers may bill for attending the same deposition or meeting (activity code A109 or narratives mentioning deposition/meeting attendance) on the same day.
- `### 3.4 Travel` — Non-working travel time is billed at 50% of the timekeeper's standard rate.
- `### 3.5 Clerical tasks` — Filing, copying, scheduling, and document organization are clerical and not billable regardless of timekeeper.
- `### 3.6 Daily cap` — No timekeeper may bill more than 10 hours on this matter in a single day.
- `### 3.7 Reasonableness` — All time billed must be reasonable and necessary to the representation. ← judgment
**`data/invoice-oct.csv`** — columns `id,date,timekeeperId,timekeeperName,role,hours,rate,amount,taskCode,activityCode,narrative,matterId`; 20 entries for matter `ACME-LIT-0042`, Oct 2026; 3 timekeepers (partner $950, associate $620, paralegal $280). Plant exactly: 1× block billing (3 tasks, 3.2h), 1× vague ("attention to file", 0.8h), 3 timekeepers at the same deposition on one day (A109), 1× travel at full rate (4h), 1× paralegal "organized and filed exhibits", 1× associate with 11.5h total on one day (two entries). Plus 2 near-misses that must NOT flag: (a) "Reviewed and revised draft motion to compel" at 0.4h (contains "and" but is under the 0.5h block-billing threshold); (b) a client strategy meeting (A109) attended by exactly 2 timekeepers. Total at risk should be a few thousand dollars.
**`data/golden.json`** — `{ "<entryId>": ["3.1"], ... }` for 15 entries (include clean entries as `[]`).
**`data/uscis-h1b.md`** — 3 clauses: 4.1 offered wage must be ≥ the prevailing wage on the certified LCA; 4.2 worksite ZIP must be listed on the certified LCA; 4.3 petition may be filed no more than 180 days before the requested start date. **`data/petitions.json`** — 3 synthetic petitions, one violating 4.1 and 4.3.

## 6. Sync with the frontend (critical)
- The frontend codes against the contract with mocks from minute 0. Your job is to make each endpoint LIVE fast and flip it in `.coord/api-status.md` **only after curl verification**.
- Priority order for going LIVE: `rulebook GET` → `compile/stream` → `approve/approve-all` → `invoice GET` → `check` → `flags` → `dashboard` → `eval` → `suggest` → `review/audit`.
- Check `.coord/requests.md` every 5 minutes; answer frontend requests within minutes. Contract changes: additive only, log in `.coord/contract-changelog.md`.
- Never edit frontend-owned files (see COORDINATION.md).

## 7. Milestones (report to the user at each one, briefly)
- **M1 (6:50):** scaffold + deps + prisma + gate open; engine types and tests drafted.
- **M2 (7:10):** engine green; seed works; `GET /api/rulebooks/rb_acme_ocg` LIVE.
- **M3 (7:25):** compile stream LIVE end-to-end on acme-ocg (6 verified/active-able rules + 1 needs_interpretation; at least one rule shows a real repair).
- **M4 (7:40):** check/flags/dashboard/eval LIVE; golden ≥ 14/15; suggest LIVE.
- **M5 (7:50):** freeze. `npm test` green, `npm run build` green, demo cache recorded, `DEMO_REPLAY=1` verified. Report final status to the user.

Start now: read the four files, then spawn all agents in parallel in one go, then do your scaffold steps.
