/**
 * B12 — API smoke + contract-shape conformance.
 * Usage:  npx tsx tests/api.smoke.ts [--base http://localhost:3000] [--no-reset] [--create] [--recompile] [--uscis]
 * Walks the demo order and prints a PASS/FAIL table. Exit code 1 if any FAIL.
 */
import { API, DEMO } from "../shared/contract";
import type { CompileEvent } from "../shared/contract";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const BASE = (() => {
  const i = args.indexOf("--base");
  return i >= 0 ? args[i + 1] : process.env.SMOKE_BASE ?? "http://localhost:3000";
})();

type Row = { step: string; route: string; status: "PASS" | "FAIL" | "SKIP"; ms: number; note: string };
const rows: Row[] = [];

/* ───────── tiny shape checker ───────── */
type Spec = Record<string, string>; // key -> "string" | "number" | "boolean" | "array" | "object" | "string?" ...
function check(obj: unknown, spec: Spec, where: string, errs: string[]) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    errs.push(`${where}: expected object, got ${Array.isArray(obj) ? "array" : typeof obj}`);
    return;
  }
  const o = obj as Record<string, unknown>;
  for (const [k, tRaw] of Object.entries(spec)) {
    const optional = tRaw.includes("?");
    const types = tRaw.replace("?", "").split("|");
    const v = o[k];
    if (v === undefined) {
      if (!optional) errs.push(`${where}.${k}: missing`);
      continue;
    }
    const actual = v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
    if (!types.includes(actual)) errs.push(`${where}.${k}: expected ${types.join("|")}, got ${actual}`);
  }
}
const enumCheck = (v: unknown, allowed: readonly string[], where: string, errs: string[]) => {
  if (v !== undefined && !allowed.includes(v as string)) errs.push(`${where}: '${String(v)}' not in [${allowed.join(",")}]`);
};

const RULE_STATUS = ["pending", "compiling", "testing", "repairing", "verified", "uncertain", "needs_interpretation", "active"] as const;
const SEVERITY = ["reject", "reduce", "warn"] as const;
const FLAG_STATUS = ["open", "accepted", "dismissed"] as const;
const RECORD_TYPE = ["time_entry", "h1b_petition"] as const;
const CLAUSE_KIND = ["compilable", "judgment", "informational"] as const;

const S = {
  totals: { billed: "number", atRisk: "number", entryCount: "number", flaggedCount: "number" },
  clause: { id: "string", rulebookId: "string", number: "string", title: "string", text: "string", start: "number", end: "number", kind: "string?", kindReason: "string?" },
  compiledRule: { id: "string", clauseId: "string", status: "string", attempts: "number", dsl: "object|null", tests: "array", testResults: "array", approvedBy: "string?|null", approvedAt: "string?|null" },
  rulebook: { id: "string", clientId: "string", clientName: "string", title: "string", recordType: "string", sourceText: "string", clauses: "array", rules: "array", createdAt: "string" },
  rulebookSummary: { id: "string", title: "string", clientName: "string", recordType: "string", clauseCount: "number", statusCounts: "object" },
  entry: { id: "string", invoiceId: "string", date: "string", timekeeperId: "string", timekeeperName: "string", role: "string", hours: "number", rate: "number", amount: "number", taskCode: "string", activityCode: "string", narrative: "string", matterId: "string" },
  invoice: { id: "string", clientId: "string", matterId: "string", period: "string", entries: "array", totals: "object" },
  invoiceSummary: { id: "string", matterId: "string", period: "string", totals: "object" },
  flag: { id: "string", invoiceId: "string", entryId: "string", ruleId: "string", clauseId: "string", clauseNumber: "string", ruleTitle: "string", severity: "string", message: "string", impactUsd: "number", status: "string", note: "string?|null", suggestion: "object?|null" },
  suggestion: { explanation: "string", narrative: "string?", splitEntries: "array?", verified: "boolean" },
  evalResult: { invoiceId: "string", correct: "number", total: "number", perRule: "array", mismatches: "array" },
  evalRow: { ruleId: "string", clauseNumber: "string", title: "string", tp: "number", fp: "number", fn: "number", precision: "number", recall: "number" },
  review: { id: "string", type: "string", title: "string", detail: "string", refId: "string", createdAt: "string" },
  audit: { id: "string", actor: "string", action: "string", targetType: "string", targetId: "string", note: "string?|null", createdAt: "string" },
  testResult: { name: "string", expectFlagged: "boolean", actualFlagged: "boolean", passed: "boolean" },
};

function checkCompiledRule(r: unknown, w: string, e: string[]) {
  check(r, S.compiledRule, w, e);
  const o = r as Record<string, unknown>;
  enumCheck(o?.status, RULE_STATUS, `${w}.status`, e);
  if (Array.isArray(o?.testResults)) (o.testResults as unknown[]).forEach((t, i) => check(t, S.testResult, `${w}.testResults[${i}]`, e));
  if (o?.dsl && typeof o.dsl === "object") check(o.dsl, { id: "string", clauseId: "string", title: "string", severity: "string", scope: "string", recordType: "string", violation: "object", message: "string" }, `${w}.dsl`, e);
}
function checkRulebook(rb: unknown, w: string, e: string[]) {
  check(rb, S.rulebook, w, e);
  const o = rb as Record<string, unknown>;
  enumCheck(o?.recordType, RECORD_TYPE, `${w}.recordType`, e);
  if (Array.isArray(o?.clauses)) (o.clauses as unknown[]).forEach((c, i) => {
    check(c, S.clause, `${w}.clauses[${i}]`, e);
    const cc = c as Record<string, unknown>;
    enumCheck(cc.kind ?? undefined, CLAUSE_KIND, `${w}.clauses[${i}].kind`, e);
    if (typeof o.sourceText === "string" && typeof cc.start === "number" && typeof cc.end === "number" && o.sourceText.slice(cc.start, cc.end) !== cc.text)
      e.push(`${w}.clauses[${i}]: sourceText.slice(start,end) !== text`);
  });
  if (Array.isArray(o?.rules)) (o.rules as unknown[]).forEach((r, i) => checkCompiledRule(r, `${w}.rules[${i}]`, e));
}
function checkFlag(f: unknown, w: string, e: string[]) {
  check(f, S.flag, w, e);
  const o = f as Record<string, unknown>;
  enumCheck(o?.severity, SEVERITY, `${w}.severity`, e);
  enumCheck(o?.status, FLAG_STATUS, `${w}.status`, e);
  if (o?.suggestion) check(o.suggestion, S.suggestion, `${w}.suggestion`, e);
}
function checkInvoice(inv: unknown, w: string, e: string[]) {
  check(inv, S.invoice, w, e);
  const o = inv as Record<string, unknown>;
  if (o?.totals) check(o.totals, S.totals, `${w}.totals`, e);
  if (Array.isArray(o?.entries)) (o.entries as unknown[]).forEach((x, i) => check(x, S.entry, `${w}.entries[${i}]`, e));
}
const arrOf = (v: unknown, fn: (x: unknown, w: string, e: string[]) => void, w: string, e: string[]) => {
  if (!Array.isArray(v)) return void e.push(`${w}: expected array, got ${typeof v}`);
  v.forEach((x, i) => fn(x, `${w}[${i}]`, e));
};

/* ───────── http ───────── */
async function call(method: string, route: string, body?: unknown): Promise<{ status: number; json: unknown; text: string }> {
  const res = await fetch(BASE + route, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown = undefined;
  try { json = JSON.parse(text); } catch { /* non-json */ }
  return { status: res.status, json, text };
}

async function step(name: string, method: string, route: string, fn: () => Promise<string | void>) {
  const t0 = Date.now();
  try {
    const note = (await fn()) ?? "";
    rows.push({ step: name, route: `${method} ${route}`, status: "PASS", ms: Date.now() - t0, note });
  } catch (err) {
    rows.push({ step: name, route: `${method} ${route}`, status: "FAIL", ms: Date.now() - t0, note: (err as Error).message.slice(0, 400) });
  }
}
const skip = (name: string, route: string, note: string) => rows.push({ step: name, route, status: "SKIP", ms: 0, note });

function expectOk(r: { status: number; json: unknown; text: string }) {
  if (r.status < 200 || r.status >= 300) {
    // Next dev 500 pages embed the error in __NEXT_DATA__ — surface it
    const m = r.text.match(/"message":"((?:[^"\\]|\\.){0,300})/);
    throw new Error(`HTTP ${r.status}: ${m ? "next error: " + m[1] : r.text.slice(0, 200)}`);
  }
  if (r.json === undefined) throw new Error(`non-JSON body: ${r.text.slice(0, 120)}`);
}
function assertNoErrs(e: string[]) {
  if (e.length) throw new Error(`${e.length} shape error(s): ${e.slice(0, 5).join("; ")}`);
}

/* ───────── SSE ───────── */
const EVENT_TYPES = ["started", "clause_found", "classified", "rule_status", "test_results", "rule_compiled", "done", "error"];
async function readCompileStream(rulebookId: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 180_000);
  const t0 = Date.now();
  const res = await fetch(BASE + API.compileStream(rulebookId), { signal: ctrl.signal, headers: { accept: "text/event-stream" } });
  if (!res.ok || !res.body) { clearTimeout(timer); throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`); }
  const ct = res.headers.get("content-type") ?? "";
  const events: CompileEvent[] = [];
  const decoder = new TextDecoder();
  let buf = "";
  const reader = res.body.getReader();
  try {
    outer: while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const data = chunk.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
        if (!data) continue;
        const ev = JSON.parse(data) as CompileEvent;
        events.push(ev);
        if (ev.type === "done") break outer;
      }
    }
  } finally {
    clearTimeout(timer);
    try { await reader.cancel(); } catch { /* */ }
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const errs: string[] = [];
  if (!ct.includes("text/event-stream")) errs.push(`content-type '${ct}'`);
  const types = events.map((e) => e.type);
  for (const [i, ev] of events.entries()) {
    if (!EVENT_TYPES.includes(ev.type)) errs.push(`event[${i}] bad type '${ev.type}'`);
    switch (ev.type) {
      case "started": check(ev, { rulebookId: "string", clauseCount: "number" }, `ev[${i}]`, errs); break;
      case "clause_found": check(ev.clause, S.clause, `ev[${i}].clause`, errs); break;
      case "classified": check(ev, { clauseId: "string", kind: "string", reason: "string" }, `ev[${i}]`, errs); enumCheck(ev.kind, CLAUSE_KIND, `ev[${i}].kind`, errs); break;
      case "rule_status": check(ev, { clauseId: "string", ruleId: "string", status: "string", attempt: "number" }, `ev[${i}]`, errs); enumCheck(ev.status, RULE_STATUS, `ev[${i}].status`, errs); break;
      case "test_results": check(ev, { clauseId: "string", ruleId: "string", results: "array" }, `ev[${i}]`, errs); break;
      case "rule_compiled": checkCompiledRule(ev.rule, `ev[${i}].rule`, errs); break;
      case "done": checkRulebook(ev.rulebook, `ev[${i}].rulebook`, errs); break;
    }
  }
  if (types[0] !== "started") errs.push(`first event '${types[0]}' (want started)`);
  if (types[types.length - 1] !== "done") errs.push(`last event '${types[types.length - 1]}' (want done)`);
  if (types.indexOf("clause_found") !== 1) errs.push(`second event '${types[1]}' (want clause_found)`);
  const firstNonClause = types.findIndex((t, i) => i > 0 && t !== "clause_found");
  if (types.slice(firstNonClause).includes("clause_found")) errs.push("clause_found after other events");
  const errorEvents = events.filter((e) => e.type === "error") as Extract<CompileEvent, { type: "error" }>[];
  if (errorEvents.some((e) => /LLM unavailable/i.test(e.message))) errs.push("LLM unavailable (no key / no cache)");
  const done = events.find((e) => e.type === "done") as Extract<CompileEvent, { type: "done" }> | undefined;
  const counts: Record<string, number> = {};
  for (const r of done?.rulebook.rules ?? []) counts[r.status] = (counts[r.status] ?? 0) + 1;
  const repaired = (done?.rulebook.rules ?? []).filter((r) => r.attempts > 1).length;
  const summary = `${events.length} events in ${secs}s; statuses ${JSON.stringify(counts)}; repaired ${repaired}; errors ${errorEvents.length}${errorEvents.length ? " " + JSON.stringify(errorEvents.map((x) => x.message).slice(0, 3)) : ""}`;
  assertNoErrs(errs.map((x) => x + ` [${summary}]`));
  return summary;
}

/* ───────── main: demo order ───────── */
async function main() {
  console.log(`CounselLint smoke → ${BASE}`);
  const rbId = DEMO.rulebookId;
  const invId = DEMO.invoiceId;
  let firstFlagId: string | undefined;
  let suggestFlagId: string | undefined;
  let firstRuleId: string | undefined;

  if (!flag("--no-reset")) {
    await step("reset", "POST", API.demoReset(), async () => {
      const r = await call("POST", API.demoReset()); expectOk(r);
      if ((r.json as { ok?: unknown })?.ok !== true) throw new Error(`body ${r.text.slice(0, 80)} (want {ok:true})`);
    });
  } else skip("reset", `POST ${API.demoReset()}`, "--no-reset");

  await step("dashboard", "GET", API.dashboard(), async () => {
    const r = await call("GET", API.dashboard()); expectOk(r);
    const e: string[] = []; const o = r.json as Record<string, unknown>;
    check(o, { client: "object", rulebook: "object|null", latestInvoice: "object|null" }, "dash", e);
    check(o.client, { id: "string", name: "string" }, "dash.client", e);
    if (o.rulebook) check(o.rulebook, S.rulebookSummary, "dash.rulebook", e);
    if (o.latestInvoice) { check(o.latestInvoice, S.invoiceSummary, "dash.latestInvoice", e); check((o.latestInvoice as Record<string, unknown>).totals, S.totals, "dash.latestInvoice.totals", e); }
    assertNoErrs(e);
  });

  await step("rulebooks", "GET", API.rulebooks(), async () => {
    const r = await call("GET", API.rulebooks()); expectOk(r);
    const e: string[] = []; arrOf(r.json, (x, w, er) => check(x, S.rulebookSummary, w, er), "rulebooks", e); assertNoErrs(e);
    const ids = (r.json as { id: string }[]).map((x) => x.id);
    if (!ids.includes(rbId)) throw new Error(`missing ${rbId} in ${ids.join(",")}`);
    return `${ids.length} rulebooks`;
  });

  if (flag("--create")) {
    await step("create rulebook", "POST", API.rulebooks(), async () => {
      const r = await call("POST", API.rulebooks(), { title: "Smoke rulebook", clientName: DEMO.clientName, recordType: "time_entry", sourceText: "### 1.1 Daily cap\nNo timekeeper may bill more than 10 hours in a day.\n" });
      expectOk(r); const e: string[] = []; checkRulebook(r.json, "created", e); assertNoErrs(e);
    });
  }

  await step("rulebook", "GET", API.rulebook(rbId), async () => {
    const r = await call("GET", API.rulebook(rbId)); expectOk(r);
    const e: string[] = []; checkRulebook(r.json, "rb", e); assertNoErrs(e);
    const rb = r.json as { clauses: unknown[]; rules: unknown[] };
    return `${rb.clauses.length} clauses, ${rb.rules.length} rules`;
  });

  await step("rulebook 404", "GET", API.rulebook("nope_xyz"), async () => {
    const r = await call("GET", API.rulebook("nope_xyz"));
    if (r.status !== 404) throw new Error(`HTTP ${r.status} (want 404)`);
    if (typeof (r.json as { error?: unknown })?.error !== "string") throw new Error("body not ApiError");
  });

  await step("compile stream", "GET", API.compileStream(rbId), () => readCompileStream(rbId));

  await step("rulebook after compile", "GET", API.rulebook(rbId), async () => {
    const r = await call("GET", API.rulebook(rbId)); expectOk(r);
    const e: string[] = []; checkRulebook(r.json, "rb", e); assertNoErrs(e);
    const rules = (r.json as { rules: { id: string; status: string }[] }).rules;
    firstRuleId = rules.find((x) => x.status === "verified")?.id ?? rules[0]?.id;
    const c: Record<string, number> = {}; for (const x of rules) c[x.status] = (c[x.status] ?? 0) + 1;
    return JSON.stringify(c);
  });

  await step("approve-all", "POST", API.approveAll(rbId), async () => {
    const r = await call("POST", API.approveAll(rbId), { approvedBy: DEMO.approver }); expectOk(r);
    const e: string[] = []; checkRulebook(r.json, "rb", e); assertNoErrs(e);
    const rules = (r.json as { rules: { status: string; approvedBy?: string }[] }).rules;
    if (rules.some((x) => x.status === "verified")) throw new Error("verified rules remain after approve-all");
    const active = rules.filter((x) => x.status === "active");
    if (active.some((x) => x.approvedBy !== DEMO.approver)) throw new Error("active rule without approvedBy");
    return `${active.length} active`;
  });

  if (firstRuleId) {
    const id = firstRuleId;
    await step("approve rule", "POST", API.approveRule(id), async () => {
      const r = await call("POST", API.approveRule(id), { approvedBy: DEMO.approver }); expectOk(r);
      const e: string[] = []; checkCompiledRule(r.json, "rule", e); assertNoErrs(e);
      return `${id} → ${(r.json as { status: string }).status}`;
    });
    if (flag("--recompile")) {
      await step("recompile rule", "POST", API.recompileRule(id), async () => {
        const r = await call("POST", API.recompileRule(id)); expectOk(r);
        const e: string[] = []; checkCompiledRule(r.json, "rule", e); assertNoErrs(e);
      });
    } else skip("recompile rule", `POST ${API.recompileRule(id)}`, "pass --recompile (LLM)");
  } else skip("approve rule", `POST ${API.approveRule("?")}`, "no rule id");

  await step("invoices", "GET", API.invoices(), async () => {
    const r = await call("GET", API.invoices()); expectOk(r);
    const e: string[] = []; arrOf(r.json, (x, w, er) => { check(x, S.invoiceSummary, w, er); check((x as Record<string, unknown>).totals, S.totals, `${w}.totals`, er); }, "invoices", e); assertNoErrs(e);
    if (!(r.json as { id: string }[]).some((x) => x.id === invId)) throw new Error(`missing ${invId}`);
  });

  await step("invoice", "GET", API.invoice(invId), async () => {
    const r = await call("GET", API.invoice(invId)); expectOk(r);
    const e: string[] = []; checkInvoice(r.json, "inv", e); assertNoErrs(e);
    const n = (r.json as { entries: unknown[] }).entries.length;
    if (n !== 20) throw new Error(`${n} entries (want 20)`);
    return `${n} entries`;
  });

  await step("check", "POST", API.checkInvoice(invId), async () => {
    const r = await call("POST", API.checkInvoice(invId), { rulebookId: rbId }); expectOk(r);
    const e: string[] = []; const o = r.json as Record<string, unknown>;
    check(o, { invoiceId: "string", rulebookId: "string", flags: "array", totals: "object" }, "chk", e);
    check(o.totals, S.totals, "chk.totals", e);
    arrOf(o.flags, checkFlag, "chk.flags", e); assertNoErrs(e);
    const flags = o.flags as { id: string; clauseNumber: string; severity: string }[];
    const t = o.totals as { atRisk: number; flaggedCount: number };
    if (flags.length === 0) throw new Error("0 flags (are rules active?)");
    const clauses = [...new Set(flags.map((f) => f.clauseNumber))].sort();
    firstFlagId = flags[0].id;
    suggestFlagId = (flags.find((f) => f.clauseNumber === "3.2") ?? flags.find((f) => f.clauseNumber === "3.1") ?? flags[0]).id;
    return `${flags.length} flags on ${t.flaggedCount} entries, clauses ${clauses.join(",")}, atRisk $${t.atRisk}`;
  });

  await step("flags", "GET", API.invoiceFlags(invId), async () => {
    const r = await call("GET", API.invoiceFlags(invId)); expectOk(r);
    const e: string[] = []; arrOf(r.json, checkFlag, "flags", e); assertNoErrs(e);
    return `${(r.json as unknown[]).length} flags`;
  });

  if (firstFlagId) {
    const id = firstFlagId;
    await step("PATCH flag", "PATCH", API.updateFlag(id), async () => {
      const r = await call("PATCH", API.updateFlag(id), { status: "dismissed", note: "smoke test" }); expectOk(r);
      const e: string[] = []; checkFlag(r.json, "flag", e); assertNoErrs(e);
      const f = r.json as { status: string; note?: string };
      if (f.status !== "dismissed" || f.note !== "smoke test") throw new Error(`status=${f.status} note=${f.note}`);
      const back = await call("PATCH", API.updateFlag(id), { status: "open" }); expectOk(back);
      return "dismissed → open";
    });
  } else skip("PATCH flag", `PATCH ${API.updateFlag("?")}`, "no flag");

  if (suggestFlagId) {
    const id = suggestFlagId;
    await step("suggest", "POST", API.suggestFix(id), async () => {
      const r = await call("POST", API.suggestFix(id)); expectOk(r);
      const e: string[] = []; checkFlag(r.json, "flag", e);
      const s = (r.json as { suggestion?: unknown }).suggestion;
      if (!s) e.push("flag.suggestion missing"); assertNoErrs(e);
      return `verified=${(s as { verified: boolean }).verified}`;
    });
  } else skip("suggest", `POST ${API.suggestFix("?")}`, "no flag");

  await step("eval", "GET", API.evalInvoice(invId), async () => {
    const r = await call("GET", API.evalInvoice(invId)); expectOk(r);
    const e: string[] = []; const o = r.json as Record<string, unknown>;
    check(o, S.evalResult, "eval", e);
    arrOf(o.perRule, (x, w, er) => check(x, S.evalRow, w, er), "eval.perRule", e);
    arrOf(o.mismatches, (x, w, er) => check(x, { entryId: "string", expected: "array", actual: "array" }, w, er), "eval.mismatches", e);
    assertNoErrs(e);
    return `${o.correct}/${o.total} correct`;
  });

  await step("review", "GET", API.review(), async () => {
    const r = await call("GET", API.review()); expectOk(r);
    const e: string[] = []; arrOf(r.json, (x, w, er) => { check(x, S.review, w, er); enumCheck((x as Record<string, unknown>).type, ["uncertain_rule", "judgment_clause", "dismissed_flag"], `${w}.type`, er); }, "review", e); assertNoErrs(e);
    return `${(r.json as unknown[]).length} items`;
  });

  await step("audit", "GET", API.audit(), async () => {
    const r = await call("GET", API.audit()); expectOk(r);
    const e: string[] = []; arrOf(r.json, (x, w, er) => check(x, S.audit, w, er), "audit", e); assertNoErrs(e);
    const actions = [...new Set((r.json as { action: string }[]).map((a) => a.action))];
    return `${(r.json as unknown[]).length} entries: ${actions.join(",")}`;
  });

  if (flag("--uscis")) {
    const u = DEMO.uscisRulebookId;
    await step("uscis compile", "GET", API.compileStream(u), () => readCompileStream(u));
    await step("uscis approve-all", "POST", API.approveAll(u), async () => {
      const r = await call("POST", API.approveAll(u), { approvedBy: DEMO.approver }); expectOk(r);
      const e: string[] = []; checkRulebook(r.json, "rb", e); assertNoErrs(e);
    });
    await step("uscis check", "POST", API.checkInvoice(invId), async () => {
      const r = await call("POST", API.checkInvoice(invId), { rulebookId: u }); expectOk(r);
      const flags = (r.json as { flags: { entryId: string; clauseNumber: string }[] }).flags;
      const e: string[] = []; arrOf(flags, checkFlag, "flags", e); assertNoErrs(e);
      const s = flags.map((f) => `${f.entryId}:${f.clauseNumber}`).sort().join(",");
      if (s !== "pet_02:4.1,pet_02:4.3") throw new Error(`flags ${s} (want pet_02:4.1,pet_02:4.3)`);
      return s;
    });
  }

  /* table */
  const w = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n));
  console.log("\n" + w("STEP", 24) + w("ROUTE", 48) + w("RESULT", 7) + w("ms", 8) + "NOTE");
  console.log("-".repeat(130));
  for (const r of rows) console.log(w(r.step, 24) + w(r.route, 48) + w(r.status, 7) + w(String(r.ms), 8) + r.note);
  const fails = rows.filter((r) => r.status === "FAIL").length;
  console.log(`\n${rows.filter((r) => r.status === "PASS").length} PASS, ${fails} FAIL, ${rows.filter((r) => r.status === "SKIP").length} SKIP`);
  process.exit(fails ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
