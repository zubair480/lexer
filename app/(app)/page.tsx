"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Gavel, Loader2 } from "lucide-react";
import { api } from "@/lib/client/api";
import { useCompileStream } from "@/lib/client/useCompileStream";
import { DEMO, type Clause, type CompiledRule, type Flag, type Invoice, type RuleStatus, type Rulebook } from "@/shared/contract";
import { RevealText, useCountUp } from "@/components/fx/Reveal";
import { cn } from "@/lib/utils";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

type Phase = "idle" | "compiling" | "compiled" | "approving" | "approved" | "reviewing" | "reviewed";
type PillState = "draft" | "compiling" | "tested" | "lawyer" | "uncertain" | "active" | "flagged" | "clean";

const STEPS = [
  { n: "01", label: "Compile rulebook" },
  { n: "02", label: "Approve rules" },
  { n: "03", label: "Check invoice" },
];

const GREEN: PillState[] = ["tested", "active", "clean"];
const IN_FLIGHT: RuleStatus[] = ["compiling", "testing", "repairing"];

/** Where the walkthrough should resume, given what's already persisted in the backend. */
function phaseFromState(rb: Rulebook, flags: Flag[]): Phase {
  const rules = rb.rules;
  if (rules.some((r) => r.status === "active")) {
    const ruleIds = new Set(rules.map((r) => r.id));
    return flags.some((f) => ruleIds.has(f.ruleId)) ? "reviewed" : "approved";
  }
  if (rules.some((r) => r.status === "verified" || r.status === "needs_interpretation" || r.status === "uncertain")) return "compiled";
  return "idle";
}

export default function OverviewPage() {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [rulebook, setRulebook] = useState<Rulebook | null>(null);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [revealed, setRevealed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  const stream = useCompileStream(DEMO.rulebookId);

  useEffect(() => {
    Promise.all([
      api.getInvoice(DEMO.invoiceId),
      api.getRulebook(DEMO.rulebookId),
      api.getInvoiceFlags(DEMO.invoiceId).catch(() => [] as Flag[]),
    ])
      .then(([inv, rb, fl]) => {
        const ruleIds = new Set(rb.rules.map((r) => r.id));
        const own = fl.filter((f) => ruleIds.has(f.ruleId));
        setInvoice(inv);
        setRulebook(rb);
        setFlags(own);
        setRevealed(own.length);
        setPhase(phaseFromState(rb, own));
      })
      .catch((e) => setError(String(e?.message ?? e)));
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  // Live compile stream → phase transitions.
  useEffect(() => {
    if (phase !== "compiling") return;
    if (stream.isDone && stream.rulebook) {
      setRulebook(stream.rulebook);
      setPhase("compiled");
    } else if (stream.error) {
      setError(stream.error);
      setPhase("idle");
    }
  }, [phase, stream.isDone, stream.rulebook, stream.error]);

  const clauses = rulebook?.clauses ?? [];
  const after = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
  const ruleFor = (c: Clause): CompiledRule | undefined =>
    phase === "compiling" ? stream.rules[c.id] : rulebook?.rules.find((r) => r.clauseId === c.id);
  const statusOf = (c: Clause): RuleStatus =>
    phase === "compiling" ? (stream.statusByClause[c.id]?.status ?? "pending") : (ruleFor(c)?.status ?? "pending");
  const isJudgment = (c: Clause) => statusOf(c) === "needs_interpretation";

  function compile() {
    timers.current.forEach(clearTimeout);
    setError(null);
    setFlags([]);
    setRevealed(0);
    setPhase("compiling");
    stream.start();
  }

  async function approve() {
    setPhase("approving");
    setError(null);
    try {
      setRulebook(await api.approveAll(DEMO.rulebookId));
      setPhase("approved");
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
      setPhase("compiled");
    }
  }

  async function review() {
    setPhase("reviewing");
    setError(null);
    try {
      const res = await api.checkInvoice(DEMO.invoiceId, DEMO.rulebookId);
      setRevealed(0);
      setFlags(res.flags);
      setPhase("reviewed");
      res.flags.forEach((_, i) => after(160 * (i + 1), () => setRevealed(i + 1)));
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
      setPhase("approved");
    }
  }

  const done = clauses.filter((c) => !["pending", ...IN_FLIGHT].includes(statusOf(c))).length;
  const approvable = clauses.filter((c) => statusOf(c) === "verified").length;
  const judgmentCount = clauses.filter(isJudgment).length;
  const entryCount = invoice?.entries.length ?? 0;

  const step = phase === "idle" || phase === "compiling" ? 0 : phase === "compiled" || phase === "approving" ? 1 : phase === "reviewed" ? 3 : 2;
  const busy = phase === "compiling" || phase === "approving" || phase === "reviewing";
  const action =
    phase === "idle" ? { label: "Compile rulebook", run: compile }
    : phase === "compiling" ? { label: clauses.length ? `Compiling ${done}/${clauses.length}` : "Compiling clauses", run: () => {} }
    : phase === "compiled" ? (approvable ? { label: `Approve ${approvable} rule${approvable === 1 ? "" : "s"}`, run: approve } : { label: "Recompile", run: compile })
    : phase === "approving" ? { label: "Approving", run: () => {} }
    : phase === "approved" ? { label: "Check October invoice", run: review }
    : phase === "reviewing" ? { label: `Checking ${entryCount} entries`, run: () => {} }
    // Recompiling replaces the rules server-side, so they need a fresh attorney approval.
    : { label: "Run it again", run: compile };

  const liveFlags = useMemo(() => flags.filter((f) => f.status !== "dismissed"), [flags]);
  const flagsByClause = useMemo(() => {
    const m = new Map<string, Flag[]>();
    liveFlags.forEach((f) => m.set(f.clauseNumber, [...(m.get(f.clauseNumber) ?? []), f]));
    return m;
  }, [liveFlags]);

  function pillState(c: Clause): PillState {
    const st = statusOf(c);
    if (st === "pending") return "draft";
    if (IN_FLIGHT.includes(st)) return "compiling";
    if (st === "needs_interpretation") return "lawyer";
    if (st === "uncertain") return "uncertain";
    if (st === "active") {
      if (phase === "reviewed") return flagsByClause.has(c.number) ? "flagged" : "clean";
      return "active";
    }
    return "tested";
  }

  /** "4/4 tests" from the rule's real test results (live while streaming). */
  function testLabel(c: Clause): string {
    const results = (phase === "compiling" ? stream.testResultsByClause[c.id] : undefined) ?? ruleFor(c)?.testResults ?? [];
    if (!results.length) return "Tested";
    return `${results.filter((r) => r.passed).length}/${results.length} tests`;
  }

  const reviewed = phase === "reviewed";
  const atRisk = liveFlags.reduce((s, f) => s + f.impactUsd, 0);
  const billed = invoice?.totals.billed ?? 0;
  const count = useCountUp(atRisk, reviewed);
  const share = billed ? (atRisk / billed) * 100 : 0;
  const testedCount = clauses.filter((c) => ["verified", "active"].includes(statusOf(c))).length;
  const ruleCount = clauses.length - judgmentCount;
  const entryById = useMemo(() => new Map((invoice?.entries ?? []).map((e) => [e.id, e])), [invoice]);

  const headline =
    phase === "idle" || phase === "compiling" ? "Turn the client's rulebook into tested code."
    : phase === "compiled" || phase === "approving" ? (approvable ? "Every rule passed its own tests. A lawyer signs off." : "Compiled. Some clauses need a lawyer.")
    : phase === "approved" || phase === "reviewing" ? "Rules in force. Now check the invoice."
    : liveFlags.length ? "Caught before the client could cut it." : "Clean invoice. Nothing to cut.";

  return (
    <div className="mx-auto max-w-[1360px] px-8 pb-24 pt-8">
      {/* Stepper */}
      <div className="rise flex items-center gap-3">
        {STEPS.map((s, i) => (
          <div key={s.n} className="flex items-center gap-3">
            <span
              className={cn(
                "lg flex items-center gap-2.5 rounded-full px-4 py-2 text-[13px] transition-all duration-500",
                i < step && "lg-green text-white",
                i === step && "text-white !border-white/50",
                i > step && "text-white/75",
              )}
            >
              <span className={cn("flex w-4 justify-center font-mono text-[11px]", i < step ? "text-white/85" : "text-white/50")}>
                {i < step ? <Check className="h-3.5 w-3.5" /> : s.n}
              </span>
              {s.label}
            </span>
            {i < STEPS.length - 1 ? <span className={cn("h-px w-10 transition-colors duration-700", i < step ? "bg-[#34e27f]" : "bg-white/15")} /> : null}
          </div>
        ))}
      </div>

      {/* Hero */}
      <div className="mt-9 flex items-end justify-between gap-10">
        <h1 className="max-w-[20ch] text-[56px] font-light leading-[1.04] tracking-[-0.045em] text-white">
          <RevealText key={headline} text={headline} step={45} />
        </h1>
        <button
          onClick={action.run}
          disabled={busy || !invoice}
          className={cn(
            "lg flex shrink-0 items-center gap-3 rounded-[24px] px-9 py-5 text-[17px] font-medium tracking-[-0.01em] text-white disabled:cursor-wait",
            phase === "approved" && "lg-green",
          )}
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
          {action.label}
          {!busy ? <ArrowUpRight className="h-5 w-5" /> : null}
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-[#ff5a4e]">{error}</p> : null}

      {/* Stat tags (asymmetric) */}
      <div className="mt-10 grid grid-cols-6 gap-4">
        <div className="lg rise col-span-2 rounded-[30px] px-7 py-6" style={{ animationDelay: "120ms" }}>
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/50">Billed · October</div>
          <div className="mt-3 text-[46px] font-light leading-none tracking-[-0.04em] tabular-nums">{usd(billed)}</div>
          <div className="mt-2.5 text-[13px] text-white/50">
            {entryCount} time entries · {DEMO.matterId}
          </div>
          <div className="mt-5 flex h-[46px] items-end gap-[5px]">
            {(invoice?.entries ?? []).map((e, i) => {
              const max = Math.max(1, ...(invoice?.entries ?? []).map((x) => x.amount));
              const hit = reviewed && liveFlags.some((f) => f.entryId === e.id);
              return (
                <span
                  key={e.id}
                  className={cn("spark flex-1 rounded-full transition-colors duration-500", hit ? "bg-[#ff6b5f] shadow-[0_0_10px_rgba(255,90,78,0.8)]" : "bg-white/25")}
                  style={{ height: `${18 + (e.amount / max) * 82}%`, animationDelay: `${300 + i * 25}ms` }}
                />
              );
            })}
          </div>
        </div>
        <div className={cn("lg rise col-span-1 flex flex-col justify-between rounded-[30px] px-6 py-6", testedCount && "lg-green")} style={{ animationDelay: "190ms" }}>
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/70">Rules tested</div>
          <div className="text-[52px] font-light leading-none tracking-[-0.05em] text-white">
            {testedCount}
            <span className="text-[22px] text-white/55"> / {ruleCount || clauses.length}</span>
          </div>
          <div className="text-[12.5px] text-white/70">passed their own tests</div>
        </div>
        <div className="lg rise col-span-1 flex flex-col justify-between rounded-[30px] px-6 py-6" style={{ animationDelay: "260ms" }}>
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/50">Lawyer review</div>
          <div className="flex items-center gap-3">
            <span className="orb flex h-11 w-11 items-center justify-center rounded-full">
              <Gavel className="h-5 w-5 text-[#f5c451]" />
            </span>
            <span className="text-[52px] font-light leading-none tracking-[-0.05em]">{step === 0 && phase !== "compiling" ? "–" : judgmentCount}</span>
          </div>
          <div className="text-[12.5px] text-white/50">judgment clause{judgmentCount === 1 ? "" : "s"}</div>
        </div>
        <div className={cn("lg rise col-span-2 rounded-[30px] px-7 py-6", reviewed && "lg-red")} style={{ animationDelay: "330ms" }}>
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/60">At risk of rejection</div>
              <div className={cn("mt-3 text-[46px] font-light leading-none tracking-[-0.04em] tabular-nums", !reviewed && "text-white/30")}>{reviewed ? usd(count) : "$0"}</div>
              <div className="mt-2.5 text-[13px] text-white/60">{reviewed ? `${liveFlags.length} violation${liveFlags.length === 1 ? "" : "s"} across ${flagsByClause.size} clause${flagsByClause.size === 1 ? "" : "s"}` : "Check the invoice to see it"}</div>
            </div>
            <Ring pct={reviewed ? share : 0} />
          </div>
          <div className="mt-5 h-[6px] overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-[#ff5a4e] to-[#ffb08a] transition-[width] duration-[1600ms] ease-out" style={{ width: `${reviewed ? Math.min(100, share) : 0}%` }} />
          </div>
          <div className="mt-2 flex justify-between font-mono text-[10.5px] text-white/50">
            <span>{reviewed ? `${share.toFixed(1)}% of invoice` : "0%"}</span>
            <span>{usd(billed)}</span>
          </div>
        </div>
      </div>

      {/* Clause capsules */}
      <section className="mt-14">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[22px] font-light tracking-[-0.03em] text-white">Acme Outside Counsel Guidelines</h2>
          <Link href={`/rulebooks/${DEMO.rulebookId}`} className="text-[13px] text-white/50 transition hover:text-white">
            Open the compiler →
          </Link>
        </div>
        <div className="mt-5 grid grid-cols-4 gap-4">
          {clauses.map((c, i) => {
            const st = pillState(c);
            const green = GREEN.includes(st);
            const amount = (flagsByClause.get(c.number) ?? []).reduce((s, f) => s + f.impactUsd, 0);
            return (
              <div
                key={`${c.id}-${st}`}
                className={cn(
                  "lg rise flex h-[116px] flex-col justify-center rounded-full px-9",
                  st === "draft" && "opacity-50",
                  st === "compiling" && "lg-busy",
                  green && "lg-green pop",
                  (st === "lawyer" || st === "uncertain") && "lg-amber pop",
                  st === "flagged" && "lg-red pop",
                )}
                style={{ animationDelay: st === "draft" ? `${200 + i * 60}ms` : "0ms" }}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-mono text-[12px] text-white/65"><span className="orb h-2.5 w-2.5 rounded-full" />§{c.number}</span>
                  <span className={cn("flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.12em]", "text-white/80")}>
                    {st === "draft" && "Draft"}
                    {st === "compiling" && (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" /> Compiling
                      </>
                    )}
                    {st === "tested" && (
                      <>
                        <Check className="h-3 w-3" /> {testLabel(c)}
                      </>
                    )}
                    {st === "active" && "In force"}
                    {st === "uncertain" && "Review"}
                    {st === "clean" && "Clean"}
                    {st === "lawyer" && (
                      <>
                        <Gavel className="h-3 w-3" /> Lawyer
                      </>
                    )}
                    {st === "flagged" && (amount > 0 ? <span className="font-mono text-[13px] normal-case tracking-normal">−{usd(amount)}</span> : "Warning")}
                  </span>
                </div>
                <div className={cn("mt-1.5 truncate text-[24px] font-normal tracking-[-0.03em]", "text-white")}>{c.title}</div>
              </div>
            );
          })}
          {clauses.length ? (
            <div className="lg rise flex h-[116px] flex-col justify-center rounded-full px-9" style={{ animationDelay: "650ms" }}>
              <span className="font-mono text-[12px] text-white/45">How it decides</span>
              <span className="mt-1.5 text-[16px] font-light leading-snug text-white/80">The model drafts each rule. Tested code makes the call.</span>
            </div>
          ) : null}
        </div>
      </section>

      {/* Findings */}
      <section className="mt-14 grid grid-cols-12 gap-5">
        <div className="lg col-span-8 rounded-[32px] p-7">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[22px] font-light tracking-[-0.03em]">Findings</h2>
            <Link href={`/invoices/${DEMO.invoiceId}`} className="text-[13px] text-white/50 transition hover:text-white">
              Open the invoice →
            </Link>
          </div>
          {reviewed ? (
            <ul className="mt-5 space-y-2.5">
              {liveFlags.slice(0, revealed).map((f) => {
                const e = entryById.get(f.entryId);
                return (
                  <li key={f.id} className="mark-in">
                    <div className="lg grid grid-cols-[72px_minmax(0,1fr)_92px_92px] items-center gap-4 rounded-full py-2.5 pl-2.5 pr-6">
                      <span className="lg lg-red rounded-full py-2 text-center font-mono text-[12px] text-white">§{f.clauseNumber}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-[14.5px] text-white">{e?.narrative ?? f.message}</span>
                        <span className="block truncate text-[12px] text-white/45">
                          {f.ruleTitle} · {e?.timekeeperName} · {e?.hours.toFixed(1)}h
                        </span>
                      </span>
                      <span className={cn("text-right font-mono text-[12.5px] text-white/35", f.impactUsd > 0 && "line-through decoration-[#ff5a4e]/70")}>{e ? usd(e.amount) : ""}</span>
                      <span className="text-right font-mono text-[14px] text-[#ff7a70]">{f.impactUsd > 0 ? `−${usd(f.impactUsd)}` : f.severity}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-5 max-w-[52ch] text-[15px] font-light leading-relaxed text-white/45">
              {step < 2
                ? "Compile and approve the rulebook first. Then every violation lands here, tied to the clause that forbids it."
                : "Rules are in force. Check the invoice."}
            </p>
          )}
        </div>
        <div className="col-span-4 space-y-5">
          <div className="lg rounded-[32px] p-7">
            <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/45">Share of invoice at risk</div>
            <div className="mt-4 flex items-center justify-between">
              <span className={cn("text-[52px] font-light leading-none tracking-[-0.06em]", reviewed ? "text-[#ff7a70]" : "text-white/30")}>
                {reviewed ? share.toFixed(1) : "0"}
                <span className="text-[24px] text-white/40">%</span>
              </span>
              <Ring pct={reviewed ? share : 0} />
            </div>
          </div>
          <Link href={`/rulebooks/${DEMO.uscisRulebookId}`} className="lg group block rounded-[32px] p-7">
            <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/45">Same engine</div>
            <div className="mt-2 flex items-center justify-between text-[22px] font-light tracking-[-0.03em] text-white">
              USCIS H-1B checklist
              <ArrowUpRight className="h-5 w-5 transition-transform duration-300 group-hover:rotate-45" />
            </div>
          </Link>
        </div>
      </section>
    </div>
  );
}

function Ring({ pct }: { pct: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <svg width="76" height="76" viewBox="0 0 76 76" className="-rotate-90">
      <circle cx="38" cy="38" r={r} stroke="rgba(255,255,255,0.1)" strokeWidth="6" fill="none" />
      <circle cx="38" cy="38" r={r} stroke="#ff5a4e" strokeWidth="6" strokeLinecap="round" fill="none" strokeDasharray={c} strokeDashoffset={c - (c * Math.min(100, pct)) / 100} className="ring-draw" style={{ filter: "drop-shadow(0 0 6px rgba(255,90,78,0.7))" }} />
    </svg>
  );
}
