# CounselLint — Coordination Rules (read before touching any file)

Two sessions (BACKEND, FRONTEND), 12 agents each, one shared folder: `Codex Law Hackathon/`.
One Next.js app. Sync happens through **files**, not chat.

## 1. Sources of truth (read in this order)
1. `PLAN.md` — what we're building and why.
2. `shared/contract.ts` — types, API routes, SSE events, demo IDs. **Code against it, never around it.**
3. `COORDINATION.md` — this file: ownership + protocols.
4. `.coord/board.md` — live status of every agent.

## 2. File ownership (never edit a file you don't own)

| Owner | Paths |
|---|---|
| **B1 (Backend Lead)** | `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.*`, `.env.example`, `prisma/**`, `lib/server/db.ts`, `shared/contract.ts` (additive only) |
| **Backend agents** | `lib/engine/**`, `lib/compiler/**`, `lib/server/**`, `app/api/**`, `data/**`, `tests/**`, `vitest.config.*` |
| **F1 (Frontend Lead)** | `app/layout.tsx`, `app/globals.css`, `components.json`, `components/ui/**` (shadcn), `tailwind` config, `postcss` config |
| **Frontend agents** | `app/(app)/**` (all pages), `app/preview/**`, `components/**` (except `components/ui`), `lib/client/**`, `public/**` |
| **Shared, append-only** | `.coord/board.md`, `.coord/requests.md`, `.coord/api-status.md`, `.coord/contract-changelog.md` |

Pages live in the route group `app/(app)/...` so they never collide with `app/api/...`.

## 3. Protocols

**Status board** — every agent appends one line to `.coord/board.md` when it STARTS, BLOCKS, or FINISHES a task:
```
[HH:MM] B7 DONE  compile+repair loop (lib/compiler/compile.ts, repair.ts) — tests green
[HH:MM] F6 BLOCKED need test_results event to include clauseId → see requests.md #3
```

**Cross-team requests** — need something from the other session? Append to `.coord/requests.md`:
```
#3 [HH:MM] F6 → B1: CompileEvent.test_results needs clauseId. STATUS: open
```
The owner replies inline and flips `STATUS: done`. Leads check this file every ~5 minutes.

**API readiness** — backend marks each endpoint in `.coord/api-status.md` as `MOCK` → `LIVE` once it returns contract-correct JSON (verified with curl). Frontend flips that endpoint from mock to live.

**Contract changes** — only B1, additive only, logged in `.coord/contract-changelog.md`. F1 updates `lib/client/mocks.ts` after each entry.

**npm lock** — before ANY `npm install`/`npx shadcn add`, create `.coord/locks/npm.lock` containing your agent id; delete it when finished. If it exists, wait. Only B1 and F1 run installs.

**Scaffold gate** — B1 scaffolds the Next.js app and then creates `.coord/SCAFFOLD_DONE`. Until that file exists, other agents write pure TS/TSX files only (no installs, no `npm run`).

## 4. Hard rules
- Synthetic data only. No real client information anywhere.
- The LLM never decides compliance; `lib/engine` does.
- Don't reformat or "clean up" files you don't own.
- Don't delete other agents' files. Don't run `git reset`, `rm -rf` on shared paths.
- Freeze at **7:50 PM**. After that: bug fixes only, no new features.
