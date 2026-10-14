# Lexer: Demo Script for Judges

> **One-liner:** *Every legal practice runs on a rulebook. We turn rulebooks into tested code.*

This script follows the app **as it actually looks today**. I walked through every screen on `localhost:3000`. Each scene says **what's on screen**, **what you click**, and **what you say**.

---

## 0. Decide these before rehearsing

| # | Issue found | What to do |
|---|-------------|------------|
| 1 | **The UI runs on mock data, not your backend.** `lib/client/live.ts` has an empty `LIVE` set, so every screen uses `lib/client/mocks.ts`. The backend works (all 17 endpoints verified), but the screens never call it. | **Option A (recommended):** turn the endpoints on in `LIVE`, then do one full dry run. Judges will see the real system. **Option B:** present with mocks and use the mock numbers in this script. Never claim it's "live" in that case. |
| 2 | **The two modes show different numbers.** Mock: $21,672 billed · **6 flags · $4,130 at risk** · eval **14/15**. Live backend: $27,398 billed · **9 flags · $4,124** · eval **15/15**. Timekeepers also differ (Chen/Park/Okafor vs Hale/Okafor/Nair). | Read the numbers **off the screen** and don't memorize them. The script below uses the mock numbers, with live ones in [brackets]. |
| 3 | **The highlighted clause text is invisible in the flag panel.** The pale highlight hides the words. This is your money shot. | Fix the text color on `<mark>` in `components/invoice/FlagPanel.tsx:166` (something in the dark theme is overriding `text-slate-900`). |
| 4 | **Clause numbers appear twice** in the source document ("3.13.1 Block Billing"). | Small fix in `components/rulebook/ClauseDocument.tsx`. Judges will notice it. |
| 5 | **The name is inconsistent:** the UI says **Lexer**, the README and earlier notes say **CounselLint**. | Pick one and use it everywhere. This script uses **Lexer** because that's what's on screen. |
| 6 | The USCIS page shows the H-1B rules but **has no petition-check screen** in the UI. | Present USCIS as "same engine, new rulebook compiled." Don't promise a flagged petition on screen. |

---

## 1. Three things the judges must remember

1. **Real money:** firms lose billed time when invoices break client guidelines. Lexer catches the problems *before* the invoice goes out.
2. **The AI writes the rules but never makes the call.** Deterministic code decides compliance: same input, same answer.
3. **Lawyers stay in charge.** Every rule is tested, then attorney-approved. Judgment clauses are never automated, and every flag cites its clause.

---

## 2. Setup (T-30 min)

- [ ] `npm test` shows all green. Leave that terminal open in a second window.
- [ ] Open `http://localhost:3000` and click through **every page once** to warm up the dev server. Each page takes about 6 s to compile on its first visit, and you don't want that happening live.
- [ ] **Mock mode:** a hard refresh (F5) resets all demo state. Do it once before you start, then **navigate only with sidebar links** during the demo. A refresh mid-demo erases your approvals and the check.
- [ ] **Live mode:** `POST /api/demo/reset` first. Make sure no one else is touching `:3000`, because the DB is shared.
- [ ] Browser zoom at 110–125%. Notifications off.
- [ ] Screen-record one clean run as your backup video.

---

## 3. The script (~3 minutes)

### Scene 1: Hook · Overview page · 0:00–0:25
**On screen:** dark dashboard, headline *"Every invoice, checked against the rulebook."*, "At risk: $—", "not yet reviewed".
**Click:** nothing yet.
**Say:**
> "Every big corporate client sends its law firms billing guidelines: no block billing, no more than two lawyers at a deposition, travel at half rate. Break a rule and the client cuts the invoice. Today someone fixes these by hand every Friday, and firms still write off real money. The guidelines are prose and the invoices are data. **Nothing connects them until the client says no.** Lexer connects them."

### Scene 2: Compile the rulebook · Rulebooks → Acme · 0:25–1:10
**Click:** sidebar **Rulebooks** → **Acme Corp Outside Counsel Guidelines (2026)** → **Recompile**, then expand **Compiler log**.
**On screen:** a progress bar counting "x of 7 compiled", the log streaming (`classified · 3.1 → compilable`, `test_results · 3.1 → 4/4 passed`), and rule cards turning **Verified** with "Passed 4/4 tests".
**Say:**
> "On the left are Acme's actual guidelines. The AI reads each clause and turns it into a typed rule. It also **writes its own test cases**, and our engine runs them."

*(When 3.2 shows "Test failed → repairing")*
> "This one failed its own tests. The failure goes back to the model, it repairs the rule, and now it passes. If it couldn't, the rule would go to a human, never into production."

*(When 3.7 turns amber, "Needs attorney")*
> "Now 3.7: 'time must be reasonable and necessary.' That's legal judgment, so **we deliberately don't automate it.** It goes to a lawyer."

### Scene 3: Attorney approval · 1:10–1:20
**Click:** **Approve all verified (6)**. The amber banner "Rules are inactive until an attorney approves them" goes away.
**Say:**
> "Nothing is enforced until an attorney signs off, and that approval is audit-logged."

### Scene 4: The reveal · Overview · 1:20–1:45
**Click:** sidebar **Overview** → the green **Run pre-bill review** button.
**On screen:** the headline changes to *"Caught before the client could cut it."* At risk counts up to **$4,130** [live: $4,124], about 19% of $21,672 billed, and findings slide in one by one with their § clause. "Where the money goes" shows exposure by clause.
**Say:**
> "Here's October's invoice. We run it against the approved rules, **with no AI involved at this step**, just deterministic code. **Six violations, $4,130 at risk** [live: nine, $4,124], each tied to the clause that forbids it. That's money the firm keeps because it caught these before the client did."

### Scene 5: Drill into one flag · Invoice page · 1:45–2:20
**Click:** **Open invoice →** → the red row *David Park · 3.4h · "Reviewed production documents; drafted motion to compel; call with client…"* (§3.1).
**On screen:** a side panel with **Reject · Block billing over 0.5 hrs**, the clause text highlighted, "Why it was flagged: narrative lists 3 separate tasks…", and Impact **$1,445**.
**Say:**
> "Click any flag and you see the exact clause it breaks, highlighted, plus why it was flagged and the dollar impact."

**Click:** **Suggest fix**. The badge **"Verified against all active rules"** appears. Then click **Accept fix**.
> "The AI suggests splitting the entry into three, and we **re-check that suggestion against every rule** before showing it as verified. Accepting it is still a human decision. Notice the footer: *flags come from deterministic rules; AI only suggests fixes.*"

### Scene 6: Proof it's accurate · Evaluation tab · 2:20–2:40
**Click:** the **Evaluation** tab.
**On screen:** a ring at **93%**, **14 / 15 entries match the hand-labeled golden set** [live: 15/15], and per-rule precision and recall.
**Say:**
> "We don't ask you to trust it, we measure it. An attorney hand-labeled this invoice, and we match 14 of 15. **The one miss is right here on screen, in travel rule 3.4.** We show our errors instead of hiding them."

*(Live mode: "15 out of 15, with precision and recall for every rule.")*

### Scene 7: It's a platform · USCIS · 2:40–2:52
**Click:** **Overview** → the **USCIS H-1B checklist** card (or Rulebooks → USCIS).
**On screen:** "USCIS H-1B Pre-Filing Checklist", record type **H-1B petitions**, **3 of 3 compiled**, and rules Prevailing Wage · Worksite Location · Filing window.
**Say:**
> "Same engine, a completely different practice area: an immigration pre-filing checklist, compiled into tested rules the same way. Billing, immigration, anything with a rulebook."

### Scene 8: Close · 2:52–3:00
**Say:**
> "The AI writes the rules, the code enforces them, and the lawyer decides. **Every legal practice runs on a rulebook. Lexer turns rulebooks into tested code.** Thank you."

---

## 4. If you get 5 minutes, add:

- **Rule details** (Rulebooks → Acme → **Details** on §3.1): show the JSON rule and its test table. "No arbitrary code. Every rule is typed, diffable and tested."
- **Review page:** *"Anything the system isn't certain about lands here. Judgment is never automated."* Show the uncertain rules, the judgment clauses, the dismissed flags with notes, and the **audit trail** (who, what, when).
- **Dismiss a flag:** open any flag → **Dismiss**. A note is *required*, and it's logged.
- **New rulebook** (Rulebooks → New): paste any guideline text → **Create & compile**. Only do this if you've rehearsed it.

---

## 5. Two-person split

- **Speaker:** says everything in Scenes 1–8 and makes eye contact with the judges.
- **Driver:** clicks only, a beat *before* each line, and never searches for a button. Rehearse the click path 3 times.

---

## 6. Judge Q&A

| Question | Answer |
|----------|--------|
| *What if the AI gets a rule wrong?* | It has to pass its own tests (up to 3 repair attempts), then an attorney approves it. If it fails, it's marked "uncertain" and goes to the Review queue, never enforced. |
| *Why not just ask ChatGPT whether each entry is compliant?* | You'd get different answers on different runs, no audit trail, and no measurable accuracy. Our engine gives the same answer every time, and we show precision and recall. |
| *Is this live AI right now?* | Answer honestly. Mock mode: "The UI is running on recorded demo data. The backend pipeline is built and tested end to end (136 tests, 17 endpoints)." Live mode: "It's running offline-deterministic so Wi-Fi can't break it. Add an API key and the same pipeline calls the model." |
| *Client confidentiality?* | The demo uses synthetic data only. Checking invoices needs **no LLM at all**. In production: zero-retention model endpoints, per-client isolation, SSO, and an audit log. |
| *Vague clauses like "reasonable"?* | They're classified as judgment, never auto-enforced, and routed to a lawyer. That's by design. |
| *Who pays?* | Law-firm billing and finance teams. The ROI is write-offs avoided per billing cycle. Roadmap: LEDES, Clio, Elite 3E and Aderant integrations, plus PDF guideline upload. |
| *Limitations?* | "Johnson & Johnson" can trip the block-billing splitter, and travel without the A110 code can slip through. Both are captured in our adversarial tests and fixable as rule tweaks. |

---

## 7. If something breaks

| Problem | Do this |
|---------|---------|
| A page sits on "Loading…" | It's the dev server compiling on first visit. Keep talking and it loads in about 6 s. (Warm-up prevents this.) |
| Numbers don't match the script | Read what's on screen. Never argue with your own demo. |
| The demo state got wiped (someone hit refresh) | Re-do Approve all → Run pre-bill review. It takes about 15 s. |
| Something crashes | "Let me show you the recorded run" → play the backup video. Don't debug on stage. |
