# FRONTEND SESSION PROMPT — CounselLint

You are the **FRONTEND LEAD (F1)** of a hackathon team building **CounselLint** in `Codex Law Hackathon/` (your working directory). A BACKEND session with its own agent team works in the same folder at the same time. Demo **8:00 PM**, freeze **7:50 PM**. Move FAST.

## 0. Read first (2 minutes max)
`PLAN.md` (§7 screens, §12 demo script) → `shared/contract.ts` (all types, `API` routes, `CompileEvent`, `DEMO` ids) → `COORDINATION.md` (ownership, board, requests, npm lock, scaffold gate) → `.coord/*`.

## 1. Product in one line
Clients' billing guidelines get compiled by AI into **tested rules**; invoices are checked **before** sending; every flag links to the **exact clause**; judgment clauses go to a **human**. The UI must make that visible and impressive.

## 2. SHOW THE USER EVERYTHING IN CHROME — feature by feature
- Use **Claude in Chrome** (the user's real Chrome, `mcp__claude-in-chrome__*` tools; load them in one ToolSearch call). Open `http://localhost:3000` in a new tab and keep it as the demo tab.
- After **each feature** below: navigate Chrome to that screen, run through the interaction once so the user sees it working, then post a 2-line summary ("Built X. Try clicking Y."). 
- **Feature 0 is the only hard stop:** wait for the user's OK on the look & feel. After that, keep going to the next feature immediately; the user will interrupt if they want changes. Apply requested changes before moving on.
- Until the dev server is up, build against mocks; nothing waits on the backend.

## 3. Agent team — spawn AT LEAST 12 parallel agents now (more if your tool allows: F13–F16)
Spawn all at once, as background sub-agents in this folder. Each gets: its ID, lane, owned paths, and the instruction to read the contract + COORDINATION.md first and log START/BLOCKED/DONE to `.coord/board.md`. Agents for later features build their components immediately (in isolation, against mocks); they get wired into pages in feature order.

| ID | Lane | Owns |
|---|---|---|
| **F1 (you)** | Lead: shadcn init, app shell, design tokens, Chrome demos, merge | `app/layout.tsx`, `app/globals.css`, `components.json`, `components/ui/**`, `components/shell/**` |
| **F2** | API client + mocks + SSE hook | `lib/client/api.ts`, `lib/client/mocks.ts`, `lib/client/useCompileStream.ts`, `lib/client/live.ts` |
| **F3** | Shared atoms | `components/common/StatusBadge.tsx`, `SeverityPill.tsx`, `Money.tsx`, `StatCard.tsx`, `EmptyState.tsx` |
| **F4** | Feature 1: Dashboard | `app/(app)/page.tsx`, `components/dashboard/**` |
| **F5** | Feature 2a: Clause document panel with live highlights | `components/rulebook/ClauseDocument.tsx` |
| **F6** | Feature 2b: Rule cards (stream states, tests table, JSON, approve) | `components/rulebook/RuleCard.tsx`, `TestTable.tsx`, `RuleJson.tsx` |
| **F7** | Feature 2c: Compile page wiring + progress header + Approve all | `app/(app)/rulebooks/[id]/page.tsx`, `components/rulebook/CompileHeader.tsx` |
| **F8** | Feature 3a: Invoice entries table + totals bar | `app/(app)/invoices/[id]/page.tsx`, `components/invoice/EntryTable.tsx`, `TotalsBar.tsx` |
| **F9** | Feature 3b: Flag side panel (clause quote, impact, verified fix, accept/dismiss) | `components/invoice/FlagPanel.tsx`, `SuggestionBox.tsx` |
| **F10** | Feature 4: Eval tab | `components/invoice/EvalTab.tsx` |
| **F11** | Feature 5: Review queue + audit trail | `app/(app)/review/page.tsx`, `components/review/**` |
| **F12** | Feature 6: New rulebook / invoice upload + USCIS swap; QA of every screen | `app/(app)/rulebooks/new/page.tsx`, `app/(app)/invoices/new/page.tsx`, `components/upload/**` |
| F13–F16 (optional) | Animations/polish, empty/loading/error states, keyboard & a11y, responsive check | as assigned by F1 |

## 4. Mocks → live switching (F2)
- `lib/client/api.ts`: one typed function per `API` route, returning contract types. Reads `.coord/api-status.md` is not possible at runtime, so use `lib/client/live.ts`: a `Set` of endpoint keys that are LIVE. F2 updates it when backend flips a row to LIVE in `.coord/api-status.md` (check every 5 min). Global override: `NEXT_PUBLIC_USE_MOCKS=1` forces all mocks.
- `lib/client/mocks.ts`: realistic data matching the contract and `DEMO` ids: Acme rulebook with the 7 clauses from PLAN.md §8 (3.1–3.7, 3.7 = judgment), invoice of 20 entries, ~6 flags, eval 14/15.
- `useCompileStream(rulebookId)`: uses `EventSource` on `API.compileStream`; in mock mode replays a scripted event sequence with delays (include one rule that goes `testing → repairing (attempt 2) → verified` and 3.7 going to `needs_interpretation`). Returns `{ clauses, rules, statusByClause, events, isDone, error }`.
- Data fetching: plain `fetch` + React state, or SWR if installed. Pages are client components where interactive.

## 5. Visual design (Feature 0 — build fast, then STOP for approval)
- Feel: **calm, premium legal software**. White/near-white background, slate text, **deep navy** primary (#1E2A4A-ish), one accent (teal) for "verified".
- Typography: Inter (UI); **serif (e.g. Source Serif / Georgia) for guideline clause text** so it feels like a legal document; monospace for rule JSON.
- Status colors (consistent everywhere): verified = green, active = navy solid, compiling/testing = blue pulse, repairing = violet pulse, uncertain = orange, needs_interpretation = amber, reject = red, reduce = orange, warn = yellow.
- Shell: left sidebar (logo "CounselLint", nav: Dashboard, Rulebooks, Invoices, Review), top bar shows client "Acme Corp" + "Synthetic data" badge.
- F1 builds `app/preview/page.tsx`: the shell + one sample of each atom (badges, pills, a rule card, a clause block, a flagged row) using mocks. Open it in Chrome → **wait for user OK**.

## 6. Features (wire and demo in this order)
**Feature 1 — Dashboard `/`**: client card; rulebook card (7 clauses, status counts as badges, "Open rulebook" button); latest invoice card (20 entries · 6 flags · **$X at risk** big number, "Check invoice" button); "How it works" 3-step strip (Compile → Approve → Check).

**Feature 2 — Compile view `/rulebooks/[id]`** (THE wow screen): 
- Header: title, client, progress ("5 of 7 compiled"), **Compile** button (starts stream), **Approve all verified** button.
- Left (55%): `ClauseDocument` — full guideline text in serif; each clause highlighted by its `start/end` offsets as `clause_found` arrives, tinted by status; clicking a clause scrolls its rule card into view.
- Right (45%): `RuleCard` per clause, animating through statuses (pending → compiling → testing → repairing attempt n → verified / uncertain / needs_interpretation → active). Expand: rule summary in plain words, `TestTable` (name, expected, actual, ✓/✗), `RuleJson` (collapsible, mono). Judgment card: amber, "Needs attorney interpretation — not auto-enforced", with reason. Approve button per card (→ active, shows approver + time).

**Feature 3 — Invoice check `/invoices/[id]`**: `TotalsBar` (Billed · At risk · Flags); **Run check** button (POST check with `DEMO.rulebookId`); `EntryTable` (date, timekeeper, role, hours, rate, amount, codes, narrative) with flagged rows tinted by severity and pills showing clause numbers. Click a row → `FlagPanel` (sheet on the right): rule title, severity, **the clause text quoted in serif with the relevant part highlighted**, explanation, $ impact, **Suggest fix** → `SuggestionBox` shows rewritten narrative or split entries with a green "✓ Verified against all active rules" badge (or grey "not verified"), Accept / Dismiss (with note).

**Feature 4 — Eval tab** (tab on the invoice page): big "14 / 15 entries correct", per-rule table (clause, title, precision, recall as bars), mismatches list.

**Feature 5 — Review queue `/review`**: three sections (Uncertain rules, Judgment clauses, Dismissed flags) with actions; audit trail timeline at the bottom.

**Feature 6 — Upload + USCIS swap**: `/rulebooks/new` (title, client, record type, paste text or load a sample button, Create → goes to compile view); `/invoices/new` (CSV paste/upload). On the dashboard, a small "Try another rulebook: USCIS H-1B checklist" link to `/rulebooks/rb_uscis_h1b`.

## 7. Rules
- Types only from `@/shared/contract`. If you need a contract change, write it in `.coord/requests.md` (to B1); never edit the contract yourself.
- Never edit backend-owned files (`app/api/**`, `lib/engine/**`, `lib/compiler/**`, `lib/server/**`, `prisma/**`, `data/**`, `package.json`).
- Before the scaffold exists (`.coord/SCAFFOLD_DONE` missing), write pure `.tsx/.ts` files only. After it exists, F1 takes `.coord/locks/npm.lock`, runs `npx shadcn@latest init -d` and adds: `button card badge table tabs sheet dialog input textarea select separator scroll-area tooltip progress skeleton sonner`, then releases the lock. Only F1 installs packages.
- F1 starts `npm run dev` once (port 3000) and keeps it running; agents don't start their own servers.
- Every screen needs loading, empty, and error states. No console errors. Works at 1440px and 1280px wide.
- Freeze at 7:50 PM: then only fixes. Final step: walk the full demo (PLAN.md §12) in Chrome for the user.

Start now: read the files, spawn all agents in one go, build Feature 0, show it in Chrome.
