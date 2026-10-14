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
