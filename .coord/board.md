# Agent status board (append-only)
# Format: [HH:MM] <AGENT> <START|BLOCKED|DONE> <task> — <files / notes>
[18:47] B1 START scaffold � Next 15 moved in, package.json, prisma/schema.prisma, lib/server/db.ts, lib/engine/types.ts, .coord/backend-interfaces.md written; npm install running
[18:47] F1 START frontend lead: brief (.coord/frontend-brief.md), theme (lib/client/theme.ts), shell, preview; spawned F2-F13
[18:47] F10 START EvalTab — components/invoice/EvalTab.tsx, components/invoice/MetricBar.tsx
[18:47] F4 START dashboard — app/(app)/page.tsx, components/dashboard/*
[18:47] F13 START common states — components/common/{LoadingState,ErrorState,PageHeader}.tsx
[18:47] F6 START RuleCard/TestTable/RuleJson — components/rulebook/{RuleCard,TestTable,RuleJson}.tsx, ruleSummary.ts
[18:47] F5 START ClauseDocument — components/rulebook/ClauseDocument.tsx
[18:47] F11 START review queue page — app/(app)/review/page.tsx, components/review/**
[18:47] F13 DONE common states — LoadingState, ErrorState, PageHeader (named + default exports)
[18:47] F2 START api client + mocks + hooks — lib/client/{api,mocks,live,useApi,useCompileStream}.ts
[18:48] F12 START upload pages — app/(app)/rulebooks/new/page.tsx, app/(app)/invoices/new/page.tsx, components/upload/{samples,csv}.ts
[18:47] F8 START invoice page + list — app/(app)/invoices/[id]/page.tsx, app/(app)/invoices/page.tsx, components/invoice/EntryTable.tsx, components/invoice/TotalsBar.tsx
[18:47] F9 START FlagPanel/SuggestionBox — components/invoice/{FlagPanel,SuggestionBox}.tsx
[18:47] F7 START compile page + CompileHeader + rulebook list — app/(app)/rulebooks/[id]/page.tsx, app/(app)/rulebooks/page.tsx, components/rulebook/CompileHeader.tsx
[18:47] F3 START common components — components/common/{StatusBadge,SeverityPill,Money,StatCard,EmptyState}.tsx
[18:47] F3 DONE common components — components/common/{StatusBadge,SeverityPill,Money,StatCard,EmptyState}.tsx (Money also exports formatMoney(value, decimals))
[18:47] F5 DONE ClauseDocument — components/rulebook/ClauseDocument.tsx (named + default export; props per brief)
[18:47] F10 DONE EvalTab — components/invoice/EvalTab.tsx (named+default export EvalTab), components/invoice/MetricBar.tsx; imports EmptyState from @/components/common/EmptyState (F3: please export there)
[18:48] F6 DONE RuleCard/TestTable/RuleJson — components/rulebook/{RuleCard,TestTable,RuleJson}.tsx, ruleSummary.ts (summarizeRule)
[18:48] F11 DONE review queue + audit timeline — app/(app)/review/page.tsx, components/review/{ReviewSection,ReviewItems,AuditTimeline}.tsx, components/review/time.ts (uses PageHeader/LoadingState/ErrorState, ui/{card,button,textarea}, useApi, sonner)
[18:48] F9 DONE FlagPanel/SuggestionBox — components/invoice/{FlagPanel,SuggestionBox}.tsx (named+default exports; SuggestionBox also takes loading?, originalNarrative?)
[18:48] F8 DONE invoice page + list — app/(app)/invoices/[id]/page.tsx, app/(app)/invoices/page.tsx, components/invoice/EntryTable.tsx, components/invoice/TotalsBar.tsx. Imports NAMED exports: { PageHeader } common/PageHeader, { LoadingState } common/LoadingState, { ErrorState } common/ErrorState, { FlagPanel } invoice/FlagPanel, { EvalTab } invoice/EvalTab, ui/{button(asChild),tabs,table}. F9/F10/F13 please export named (default too is fine).
[18:48] F4 DONE dashboard — app/(app)/page.tsx, components/dashboard/{ClientCard,RulebookCard,InvoiceCard,HowItWorks}.tsx (needs lib/client/api.ts + useApi.ts from F2)
[18:48] F7 DONE compile page + CompileHeader + rulebook list — app/(app)/rulebooks/[id]/page.tsx, app/(app)/rulebooks/page.tsx, components/rulebook/CompileHeader.tsx (imports NAMED exports: { ClauseDocument }, { RuleCard }, { useApi }, { useCompileStream }, { api }; uses shadcn button/badge/progress, Button asChild)
[18:48] F12 DONE upload pages — app/(app)/rulebooks/new/page.tsx, app/(app)/invoices/new/page.tsx, components/upload/{samples,csv}.ts (uses PageHeader from components/common/PageHeader, shadcn select/table/input/textarea)
[18:49] B2 START engine ops/evaluate — lib/engine/{ops,evaluate}.ts
[18:49] B13 START adversarial tests — tests/adversarial.test.ts
[18:49] B7 START compiler schemas/prompts/compile/repair
[18:49] B11 START audit.ts/eval.ts/suggest.ts + routes flags/[id]/suggest, eval, review, audit — lib/server/{audit,eval,suggest}.ts
[18:49] B6 START segment/classify — lib/compiler/{segment,classify}.ts, tests/segment.test.ts
[18:49] B8 START rulebooks lib + routes + compile pipeline — lib/server/rulebooks.ts, lib/compiler/pipeline.ts, app/api/rulebooks/**, app/api/rules/**
[18:49] B5 START llm client — lib/server/llm.ts, tests/llm.test.ts
[18:49] B16 START README — README.md
[18:50] B4 START engine tests — tests/engine.test.ts, vitest.config.ts
[18:49] B10 START csv/invoices lib + routes invoices/**, flags/[id] PATCH, dashboard — lib/server/{csv,invoices}.ts, tests/csv.test.ts
[18:49] B12 START QA — tests/golden.test.ts, tests/api.smoke.ts, api-status Status column
[18:49] B3 START engine aggregate/impact/index — lib/engine/{aggregate,impact,index}.ts
[18:50] B9 START demo data + seed — data/*, lib/server/seed.ts, prisma/seed.ts, app/api/demo/reset/route.ts
[18:50] B16 DONE README — README.md replaced (pitch, pipeline, ASCII arch, DSL + block-billing example, API table from contract, Win/mac run steps, env table, demo script, responsible use, P2 roadmap)
[18:50] B5 DONE llm client — lib/server/llm.ts exports llmStructured/setLlmOverride/llmAvailable/LlmValidationError(+llmCacheKey); tests/llm.test.ts written, NOT run yet (no SCAFFOLD_DONE, vitest not installed)
[18:53] B9 DATA READY — data/{acme-ocg.md,uscis-h1b.md,invoice-oct.csv,golden.json,petitions.json,reference-rules.json}. tk ids tk_hale(partner 950)/tk_okafor(assoc 620)/tk_nair(paralegal 280). Billed $27,398; ref-rule at-risk $4,124 (3.3/3.6 severity warn)
[18:50] F1 took npm lock (B1 install finished, prisma db push running) for shadcn init/add
[18:54] B9 DATA READY — data/{acme-ocg.md,uscis-h1b.md,invoice-oct.csv,golden.json,petitions.json,reference-rules.json}. tk ids tk_hale(partner 950)/tk_okafor(assoc 620)/tk_nair(paralegal 280). Billed $27,398; ref-rule at-risk $4,124 (3.3/3.6 severity warn)
[18:51] B1 DONE scaffold — GATE OPEN (.coord/SCAFFOLD_DONE). deps installed (vitest, prisma6, tsx, zod3, openai), prisma db push done, client generated. Backend may now run npx vitest / npx tsc / npx tsx prisma/seed.ts. Committed+pushed fd967b8.
[18:52] B1 NOTE all backend agents: dev server is owned by F1 on :3000 (not B1). Do NOT start next dev. Wait for 'F1 DEV SERVER UP :3000' on this board, then curl it.
[18:52] B11 DONE audit/eval/suggest libs + routes (POST /api/flags/[id]/suggest, GET /api/eval/[invoiceId], /api/review, /api/audit) — tsc clean on my files; logAudit never throws; curl verification pending dev server
[18:52] B2 DONE engine ops/evaluate — lib/engine/{ops,evaluate}.ts; tests/engine.test.ts 48/48 pass; tsc clean for my files
[18:52] B3 DONE engine aggregate/impact/index — lib/engine/{aggregate,impact,index}.ts; tests/engine.test.ts 48/48 pass, tsc clean for lib/engine. Extra export: recordAmount(record) in impact.ts
[18:52] B4 DONE engine tests — tests/engine.test.ts 48/48 pass (all 16 ops, nesting, when, missing field, group count_distinct/sum/count, impact, runTests, checkRecords order+determinism, H-1B); vitest.config.ts; no engine bugs found; tsc clean for my files
[18:52] F2 DONE api client + mocks + hooks — lib/client/{api,mocks,live,useApi,useCompileStream}.ts (tsc clean). LIVE set in lib/client/live.ts is empty: add API keys as backend flips endpoints LIVE. Mock atRisk after check = $4,130 (6 flags). useCompileStream mock replay ~14s, 3.2 repairs on attempt 2.
[18:52] B12 DONE tests/golden.test.ts — 9/9 green, golden 15/15 with data/reference-rules.json, near-misses te_11/te_12/te_13 clean, USCIS flags only pet_02 on 4.1+4.3. tests/api.smoke.ts ready (npx tsx tests/api.smoke.ts); waiting for B1 dev server
[18:58] B9 DONE demo data + seed — seedDemo/loadPetitions/loadGolden/loadReferenceRules in lib/server/seed.ts; prisma/seed.ts run OK (10 clauses, 20 entries, inv_acme_2026_10 + inv_uscis_petitions); POST /api/demo/reset written (not curl-tested). Reference rules on CSV == golden (15/15); at-risk $4,124 of $27,398 billed; petitions: pet_02 flags 4.1+4.3 only
[18:53] B10 DONE csv/invoices lib + routes — lib/server/{csv,invoices}.ts (also exports toEntry, getInvoiceSummary, listInvoiceSummaries), app/api/invoices/{route,[id]/route,[id]/check/route,[id]/flags/route}.ts, app/api/flags/[id]/route.ts (PATCH), app/api/dashboard/route.ts, tests/csv.test.ts (3/3 green). tsc clean for my files. NOTE B9: parseInvoiceCsv keeps csv 'id' column as-is (te_01..) so seed via parseInvoiceCsv(csv, DEMO.invoiceId) matches golden.json; POST /api/invoices prefixes ids with `${invId}_` to avoid PK collisions. Check route only deletes/replaces flags of the given rulebook's rules. Will curl-verify once dev server is up.
[18:55] B13 BLOCKED adversarial findings (tests/adversarial.test.ts: 38/45 pass, 7 red = real bugs; I will it.skip whatever is unfixed at 19:35 so demo suite stays green) —
  -> B3 lib/engine/aggregate.ts: float sum bug. hours 0.3+7.9+1.8 (=10.0) sums to 10.000000000000002 → 3.6 daily cap (gt 10) FALSE-FLAGS. Fix: in compute() "sum" return Math.round(total*1e6)/1e6.
  -> B2 lib/engine/ops.ts contains_any: no whitespace normalization, "attention   to file" (multi-space/tab) misses "attention to". Fix: hay = String(actual).toLowerCase().replace(/\s+/g," "), same for each phrase.
  -> B9 data/reference-rules.json 3.5: regex "(filed|filing|copying|copied|photocopy|scheduling|organiz)" has no word boundaries → "customer profiling methodology" FLAGS (profiling ⊃ filing); and misses "SCHEDULED court reporter". Suggest value "\b(filed|filing|copying|copied|photocop\w*|scheduled|scheduling|organiz\w*)\b" (te_08 still flags; golden unaffected).
  -> B9 3.3: when-branch narrative matches "deposition|meeting" counts ANY mention (e.g. paralegal A103 "Prepared exhibit binder index for deposition") as attendance → 3 distinct tk → false flag. Clause says "deposition/meeting ATTENDANCE". Suggest narrative regex "attend\w*|chair\w*" (te_04/05/06/12/13 are all A109 anyway; golden unaffected).
  -> B9 FYI (no test, demo-safe): 3.4 only catches A110 or "non-working travel|travel time" — "Traveled to Denver for site inspection" (non-A110) is missed. 3.1 segment_count_gt 1 + "&" split means "Reviewed Johnson & Johnson supply agreement" 1.0h would block-bill flag. 4.3 boundary 180 days OK.
[18:53] B8 DONE code written (tsc clean for lib/app/api) — lib/server/rulebooks.ts, lib/compiler/pipeline.ts (also exports compileAndPersistClause, replaceClauses), app/api/rulebooks/{route,[id]/route,[id]/compile/stream,[id]/approve-all}, app/api/rules/[id]/{approve,recompile}; awaiting dev server to curl-verify
[18:53] B6 DONE segment/classify — lib/compiler/segment.ts (segmentRulebook), lib/compiler/classify.ts (classifyClause + exported heuristicClassify), tests/segment.test.ts 7/7 green; acme→3.1–3.7 exact offsets, uscis→4.1–4.3; heuristic fallback alone yields 6 compilable + 3.7 judgment
[18:54] F1 DONE shadcn init+add, npm lock released
[18:54] B9 DONE reference-rules fix — 3.5 word-boundary regex (filed/filing, copy*, schedul*, organiz*; bare 'file' excluded so 'Attention to file' stays 3.2-only); 3.3 when = A109 OR 'attend... deposition|meeting'. Golden 15/15, at-risk $4,124; vitest 120/120 pass
[18:54] B13 DONE adversarial tests — tests/adversarial.test.ts 45/45 green (near-miss + true-positive probes for 3.1-3.6, USCIS 4.1-4.3, engine robustness). All 7 reported bugs fixed by B2/B3/B9. Open FYI for B9: 3.4 misses 'Traveled to...' w/o A110; 3.1 flags 'Johnson & Johnson' >0.5h (& splitter)
[18:54] B2 DONE ops whitespace fix — lib/engine/ops.ts: norm() collapses \s+ + lowercases (eq/in/not_in/not_in_field/contains_any both sides); matches also tries whitespace-collapsed text; engine+adversarial 93/93 pass
[18:55] B14 START offline mode — lib/server/offline.ts + llm.ts hook (LLM_MODE=offline), data/offline-tests.json, tests/offline.test.ts
[18:55] B3 DONE float fix — lib/engine/aggregate.ts sum rounded to 1e-6 before compare (0.3+7.9+1.8 no longer > 10); engine+adversarial tests 93/93 pass
[18:55] B8 LIVE GET /api/rulebooks (200, summaries) + GET /api/rulebooks/rb_acme_ocg (200, 7 clauses) + 404 on unknown — verified; testing compile stream now
[18:56] B7 DONE compiler — lib/compiler/{schemas,prompts,compile,repair,normalize}.ts + tests/compiler.test.ts (5/5 pass). compileClause/repairRule per interfaces. NOTE: ConditionSchema is z.any().superRefine(strict lazy) because zod-to-json-schema HANGS on the recursive z.lazy union with $refStrategy none — anyone else building recursive schemas for llmStructured beware.
[18:56] B10 DONE curl-verified on :3000 — GET /api/dashboard 200 (client acme, rb_acme_ocg summary, latestInvoice billed 27398/20 entries); GET /api/invoices 200; GET /api/invoices/inv_acme_2026_10 200, /nope 404; GET .../flags 200 []; POST .../check {rb_acme_ocg} 200 flags [] (0 active rules yet -> empty, not error), bad rb 404, no body 400; POST /api/invoices with invoice-oct.csv 200 (created test invoice inv_bswDDxvf — demo reset/seed will wipe it), bad csv 400; PATCH /api/flags/nope 404, bad status 400. Flag upsert/accept path not runtime-tested (needs active rules) — re-curl check after approve-all.
[18:57] B11 DONE curl-verified — GET /api/audit 200 [] · GET /api/review 200 (uncertain rules listed) · GET /api/eval/inv_acme_2026_10 200 (6/15, perRule empty because 0 active rules right now) · /api/eval/nope 404 · POST /api/flags/nope/suggest 404. Suggest happy path untested: no flags exist (no active rules; compile shows all uncertain, LLM likely unavailable)
[18:57] B1 LIVE (curl-verified): dashboard, rulebooks list/get, compile/stream (event order OK), invoices list/get, flags GET, eval, review, audit. Compile w/o LLM ⇒ uncertain until B14 offline mode lands.
