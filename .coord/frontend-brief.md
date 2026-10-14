# FRONTEND BRIEF (F1) — shared conventions for all frontend agents

Read first: `PLAN.md` §7/§12, `shared/contract.ts`, `COORDINATION.md`, `prompts/FRONTEND_PROMPT.md`, this file.

## Stack assumptions
- Next.js 15 App Router, TypeScript, Tailwind v4, shadcn/ui (new-york). Path alias `@/*` → repo root.
- shadcn components will exist at `@/components/ui/{button,card,badge,table,tabs,sheet,dialog,input,textarea,select,separator,scroll-area,tooltip,progress,skeleton,sonner}` — import them with standard shadcn names even if they don't exist yet. `cn` from `@/lib/utils`. Icons: `lucide-react`. Toasts: `import { toast } from "sonner"`.
- Do NOT run npm, npx, or start servers. Write files only. F1 runs installs and the dev server (port 3000).
- Every interactive component/page starts with `"use client";`.
- Types ONLY from `@/shared/contract`. Never edit it, never edit backend files.

## Design tokens
- Use semantic shadcn classes: `bg-background`, `text-foreground`, `text-muted-foreground`, `bg-muted`, `border`, `bg-primary text-primary-foreground` (primary = deep navy #1E2A4A), `bg-card`.
- Status/severity colors: ALWAYS use `@/lib/client/theme` (`STATUS_META`, `SEVERITY_META`, `CLAUSE_TINT`). Don't invent new colors.
- Fonts: UI = `font-sans` (Inter). Guideline/clause text = `font-serif` (Source Serif 4). Rule JSON = `font-mono`.
- Calm premium legal look: generous whitespace, `rounded-xl` cards, subtle `shadow-sm`, slate text, small uppercase tracking-wide section labels (`text-xs font-medium uppercase tracking-wider text-muted-foreground`).
- Pages are rendered inside the app shell (sidebar + top bar) by `app/(app)/layout.tsx` (F1). Pages render only their content: wrap in `<div className="mx-auto max-w-[1400px] px-8 py-6">`. Must look good at 1280 and 1440 wide.

## API client (F2 owns `lib/client/api.ts`) — EXACT names everyone codes against
```ts
import { api } from "@/lib/client/api";
api.dashboard(): Promise<DashboardSummary>
api.listRulebooks(): Promise<RulebookSummary[]>
api.createRulebook(req: CreateRulebookReq): Promise<Rulebook>
api.getRulebook(id: string): Promise<Rulebook>
api.approveRule(ruleId: string, approvedBy?: string /* default DEMO.approver */): Promise<CompiledRule>
api.approveAll(rulebookId: string, approvedBy?: string): Promise<Rulebook>
api.recompileRule(ruleId: string): Promise<CompiledRule>
api.listInvoices(): Promise<InvoiceSummary[]>
api.createInvoice(req: CreateInvoiceReq): Promise<Invoice>
api.getInvoice(id: string): Promise<Invoice>
api.checkInvoice(id: string, rulebookId?: string /* default DEMO.rulebookId */): Promise<InvoiceCheckResult>
api.getInvoiceFlags(id: string): Promise<Flag[]>
api.suggestFix(flagId: string): Promise<Flag>
api.updateFlag(flagId: string, req: UpdateFlagReq): Promise<Flag>
api.evalInvoice(invoiceId: string): Promise<EvalResult>
api.review(): Promise<ReviewItem[]>
api.audit(): Promise<AuditEntry[]>
api.demoReset(): Promise<{ ok: true }>
```
All throw `Error(message)` on failure. Mock mode adds 250–600 ms latency and keeps in-memory state (approvals, flag status, suggestions persist during the session).

`lib/client/useApi.ts` (F2): `useApi<T>(fn: () => Promise<T>, deps: unknown[]) => { data: T | undefined; error: Error | undefined; loading: boolean; reload: () => void; setData: (t: T) => void }`.

`lib/client/useCompileStream.ts` (F2):
```ts
useCompileStream(rulebookId: string) => {
  start: () => void;            // opens the stream (Compile button). Restartable.
  isRunning: boolean; isDone: boolean; error: string | null;
  clauses: Clause[];            // in clause_found order, kind/kindReason merged in from `classified`
  rules: Record<string, CompiledRule>;          // by clauseId (from rule_compiled / done)
  statusByClause: Record<string, { status: RuleStatus; attempt: number }>;
  testResultsByClause: Record<string, TestResult[]>;
  events: CompileEvent[];
  rulebook: Rulebook | null;    // from `done`
}
```

`lib/client/mocks.ts` (F2) exports synchronous fixtures usable anywhere:
`MOCK_RULEBOOK` (rb_acme_ocg, compiled: 3.1–3.6 verified, 3.7 needs_interpretation), `MOCK_USCIS_RULEBOOK`, `MOCK_RULEBOOK_SUMMARIES`, `MOCK_INVOICE` (20 entries), `MOCK_FLAGS` (6 flags, one per rule 3.1–3.6, with clauseNumber), `MOCK_CHECK_RESULT`, `MOCK_EVAL` (14/15), `MOCK_REVIEW`, `MOCK_AUDIT`, `MOCK_DASHBOARD`, `mockCompileScript(rulebookId): { delayMs: number; event: CompileEvent }[]`.

## Shared component props (implement EXACTLY these; consumers rely on them)
- `components/common/StatusBadge.tsx` (F3): `StatusBadge({ status: RuleStatus; attempt?: number; className?: string })`
- `SeverityPill({ severity: Severity; className?: string })`
- `Money({ value: number; className?: string; decimals?: 0 | 2 })` → `$4,120`
- `StatCard({ label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "default" | "danger" | "success"; icon?: React.ReactNode })`
- `EmptyState({ title: string; description?: string; action?: React.ReactNode; icon?: React.ReactNode })`
- `components/common/LoadingState.tsx` (F13): `LoadingState({ rows?: number; label?: string })`; `ErrorState({ error: Error | string; onRetry?: () => void })` in `components/common/ErrorState.tsx`; `PageHeader({ title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; eyebrow?: string })` in `components/common/PageHeader.tsx`.
- `components/rulebook/ClauseDocument.tsx` (F5): `ClauseDocument({ sourceText: string; clauses: Clause[]; statusByClause: Record<string, RuleStatus>; activeClauseId?: string | null; onClauseClick?: (clauseId: string) => void })` — each highlight span has `id={"clause-" + clause.id}`.
- `components/rulebook/RuleCard.tsx` (F6): `RuleCard({ clause: Clause; rule?: CompiledRule | null; status: RuleStatus; attempt?: number; testResults?: TestResult[]; active?: boolean; onApprove?: (ruleId: string) => Promise<void> | void; onSelect?: (clauseId: string) => void })` — root element `id={"rule-card-" + clause.id}`.
- `TestTable({ results: TestResult[] })`, `RuleJson({ rule: Rule })`.
- `components/rulebook/CompileHeader.tsx` (F7): `CompileHeader({ rulebook: Rulebook | null; compiledCount: number; total: number; isRunning: boolean; onCompile: () => void; onApproveAll: () => void; approvableCount: number; approving?: boolean })`
- `components/invoice/EntryTable.tsx` (F8): `EntryTable({ entries: TimeEntry[]; flags: Flag[]; selectedEntryId?: string | null; onSelect: (entryId: string) => void })`
- `TotalsBar({ totals: InvoiceTotals; onRunCheck: () => void; isChecking: boolean; hasChecked: boolean })`
- `components/invoice/FlagPanel.tsx` (F9): `FlagPanel({ open: boolean; onOpenChange: (o: boolean) => void; entry: TimeEntry | null; flags: Flag[] /* flags for this entry */; clauses: Clause[]; onFlagUpdated: (flag: Flag) => void })` — a shadcn `Sheet` on the right.
- `SuggestionBox({ flag: Flag; onFlagUpdated: (flag: Flag) => void })`
- `components/invoice/EvalTab.tsx` (F10): `EvalTab({ invoiceId: string })` — fetches its own data.

## Board
Append to `.coord/board.md`: `[HH:MM] F# START|BLOCKED|DONE <task> — <files>`. Need something from another frontend agent? Write it on the board. Need backend? `.coord/requests.md`.

## Quality bar
Loading, empty, and error states everywhere. No `any` unless unavoidable. No console errors. Keep files self-contained; don't edit files you don't own — if you need a change in someone else's file, note it on the board.
