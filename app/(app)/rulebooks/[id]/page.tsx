"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, ChevronDown, ChevronRight, Info, ShieldAlert, Terminal } from "lucide-react";
import type {
  Clause,
  CompileEvent,
  CompiledRule,
  RuleStatus,
  TestResult,
} from "@/shared/contract";
import { api } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import { useCompileStream } from "@/lib/client/useCompileStream";
import { FINAL } from "@/lib/client/theme";
import { CompileHeader } from "@/components/rulebook/CompileHeader";
import { ClauseDocument } from "@/components/rulebook/ClauseDocument";
import { RuleCard } from "@/components/rulebook/RuleCard";
import { LoadingState } from "@/components/common/LoadingState";
import { ErrorState } from "@/components/common/ErrorState";
import { EmptyState } from "@/components/common/EmptyState";
import { PetitionCheck } from "@/components/rulebook/PetitionCheck";

function describeEvent(ev: CompileEvent, clauseNum: (id: string) => string): string {
  switch (ev.type) {
    case "started":
      return `started · ${ev.clauseCount} clauses`;
    case "clause_found":
      return `clause_found · ${ev.clause.number} ${ev.clause.title}`;
    case "classified":
      return `classified · ${clauseNum(ev.clauseId)} → ${ev.kind}`;
    case "rule_status":
      return `rule_status · ${clauseNum(ev.clauseId)} → ${ev.status}${ev.attempt > 1 ? ` (attempt ${ev.attempt})` : ""}`;
    case "test_results": {
      const passed = ev.results.filter((r) => r.passed).length;
      return `test_results · ${clauseNum(ev.clauseId)} → ${passed}/${ev.results.length} passed`;
    }
    case "rule_compiled":
      return `rule_compiled · ${clauseNum(ev.rule.clauseId)} → ${ev.rule.status}`;
    case "done":
      return `done · ${ev.rulebook.rules.length} rules`;
    case "error":
      return `error · ${ev.clauseId ? clauseNum(ev.clauseId) + " · " : ""}${ev.message}`;
    default:
      return "event";
  }
}

export default function RulebookCompilePage() {
  const params = useParams<{ id: string }>();
  const id = (Array.isArray(params?.id) ? params.id[0] : params?.id) ?? "";

  const { data: stored, error, loading, reload } = useApi(() => api.getRulebook(id), [id]);
  const stream = useCompileStream(id);

  const [overrides, setOverrides] = useState<Record<string, CompiledRule>>({});
  const [activeClauseId, setActiveClauseId] = useState<string | null>(null);
  const [approvingAll, setApprovingAll] = useState(false);
  const [logOpen, setLogOpen] = useState(true);

  const started = stream.isRunning || stream.isDone || stream.events.length > 0;
  const base = stream.rulebook ?? stored ?? null;

  const clauses: Clause[] = useMemo(() => {
    if (stream.rulebook) return stream.rulebook.clauses;
    if (started) return stream.clauses;
    return stored?.clauses ?? [];
  }, [stream.rulebook, stream.clauses, started, stored]);

  const storedRuleByClause = useMemo(() => {
    const m: Record<string, CompiledRule> = {};
    // While a fresh compile is streaming (and not done), stored rules are stale.
    const src = stream.rulebook ?? (started ? null : stored);
    for (const r of src?.rules ?? []) m[r.clauseId] = r;
    return m;
  }, [stream.rulebook, started, stored]);

  const ruleFor = useCallback(
    (cid: string): CompiledRule | undefined =>
      overrides[cid] ?? stream.rules[cid] ?? storedRuleByClause[cid],
    [overrides, stream.rules, storedRuleByClause],
  );

  const statusFor = useCallback(
    (cid: string): RuleStatus =>
      overrides[cid]?.status ??
      stream.statusByClause[cid]?.status ??
      stream.rules[cid]?.status ??
      storedRuleByClause[cid]?.status ??
      "pending",
    [overrides, stream.statusByClause, stream.rules, storedRuleByClause],
  );

  const statusByClause = useMemo(() => {
    const m: Record<string, RuleStatus> = {};
    for (const c of clauses) m[c.id] = statusFor(c.id);
    return m;
  }, [clauses, statusFor]);

  const compiledCount = clauses.filter((c) => FINAL.includes(statusByClause[c.id])).length;
  const total = started && !stream.rulebook ? Math.max(clauses.length, startedCount(stream.events)) : clauses.length;
  const approvable = clauses.filter((c) => statusByClause[c.id] === "verified" && ruleFor(c.id));
  const neverCompiled = !started && (stored?.rules.length ?? 0) === 0;
  const hasInactive = clauses.some((c) => {
    const s = statusByClause[c.id];
    return FINAL.includes(s) && s !== "active";
  });

  const clauseNumById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of [...(stored?.clauses ?? []), ...stream.clauses]) m[c.id] = c.number;
    return m;
  }, [stored, stream.clauses]);
  const clauseNum = useCallback((cid: string) => clauseNumById[cid] ?? cid, [clauseNumById]);

  // Toast when stream finishes.
  const prevDone = useRef(false);
  useEffect(() => {
    if (stream.isDone && !prevDone.current) {
      const rules = stream.rulebook?.rules ?? Object.values(stream.rules);
      const needs = rules.filter((r) => r.status === "needs_interpretation").length;
      const uncertain = rules.filter((r) => r.status === "uncertain").length;
      const ok = rules.length - needs;
      const parts = [`Compiled ${ok} rule${ok === 1 ? "" : "s"}`];
      if (needs) parts.push(`${needs} needs attorney interpretation`);
      if (uncertain) parts.push(`${uncertain} uncertain`);
      toast.success(parts.join(" · "));
    }
    prevDone.current = stream.isDone;
  }, [stream.isDone, stream.rulebook, stream.rules]);

  const prevErr = useRef<string | null>(null);
  useEffect(() => {
    if (stream.error && stream.error !== prevErr.current) toast.error(stream.error);
    prevErr.current = stream.error;
  }, [stream.error]);

  const handleCompile = () => {
    setOverrides({});
    setActiveClauseId(null);
    stream.start();
  };

  const handleApprove = async (ruleId: string) => {
    try {
      const rule = await api.approveRule(ruleId);
      setOverrides((o) => ({ ...o, [rule.clauseId]: rule }));
      toast.success(`Rule ${clauseNum(rule.clauseId)} approved`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approval failed");
    }
  };

  const handleApproveAll = async () => {
    setApprovingAll(true);
    try {
      const n = approvable.length;
      const rb = await api.approveAll(id);
      setOverrides((o) => {
        const next = { ...o };
        for (const r of rb.rules) next[r.clauseId] = r;
        return next;
      });
      toast.success(`Approved ${n} verified rule${n === 1 ? "" : "s"} — now active`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approve all failed");
    } finally {
      setApprovingAll(false);
    }
  };

  const selectClause = (cid: string) => {
    setActiveClauseId(cid);
    document.getElementById("rule-card-" + cid)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const selectCard = (cid: string) => {
    setActiveClauseId(cid);
    document.getElementById("clause-" + cid)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  if (loading && !stored) {
    return (
      <div className="mx-auto max-w-[1400px] px-8 py-6">
        <LoadingState rows={6} label="Loading rulebook..." />
      </div>
    );
  }
  if (error && !stored) {
    return (
      <div className="mx-auto max-w-[1400px] px-8 py-6">
        <ErrorState error={error} onRetry={reload} />
      </div>
    );
  }
  if (!base) {
    return (
      <div className="mx-auto max-w-[1400px] px-8 py-6">
        <EmptyState
          title="Rulebook not found"
          description="This rulebook doesn't exist or was removed."
          action={
            <Link href="/rulebooks" className="text-sm font-medium underline underline-offset-4">
              Back to rulebooks
            </Link>
          }
        />
      </div>
    );
  }

  const recentEvents = stream.events.slice(-8);

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-8 py-6">
      <Link
        href="/rulebooks"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Rulebooks
      </Link>

      <CompileHeader
        rulebook={base}
        compiledCount={compiledCount}
        total={total}
        isRunning={stream.isRunning}
        onCompile={handleCompile}
        onApproveAll={handleApproveAll}
        approvableCount={approvable.length}
        approving={approvingAll}
      />

      {stream.events.length > 0 && (
        <div className="rounded-xl border bg-card shadow-sm">
          <button
            type="button"
            onClick={() => setLogOpen((v) => !v)}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
          >
            {logOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <Terminal className="h-3.5 w-3.5" />
            Compiler log
            <span className="ml-auto font-mono normal-case tracking-normal">
              {stream.events.length} events{stream.isRunning ? " · live" : ""}
            </span>
          </button>
          {logOpen && (
            <div className="border-t bg-muted/40 px-4 py-2 font-mono text-xs leading-relaxed text-muted-foreground">
              {recentEvents.map((ev, i) => (
                <div
                  key={stream.events.length - recentEvents.length + i}
                  className={ev.type === "error" ? "text-red-600" : i === recentEvents.length - 1 ? "text-foreground" : ""}
                >
                  <span className="mr-2 text-muted-foreground/60">›</span>
                  {describeEvent(ev, clauseNum)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {neverCompiled && (
        <div className="flex items-center gap-2 rounded-xl border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <Info className="h-4 w-4 shrink-0" />
          Click <span className="font-medium text-foreground">Compile</span> to turn this rulebook into tested rules.
        </div>
      )}

      {hasInactive && !stream.isRunning && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          Rules are inactive until an attorney approves them.
        </div>
      )}

      {base.recordType === "h1b_petition" && !stream.isRunning && (
        <PetitionCheck
          rulebook={{
            ...base,
            rules: clauses.map((c) => ruleFor(c.id)).filter((r): r is CompiledRule => !!r),
          }}
        />
      )}

      <div className="grid grid-cols-[55fr_45fr] gap-6">
        <div className="sticky top-6 max-h-[calc(100vh-3rem)] self-start overflow-y-auto rounded-xl border bg-card p-6 shadow-sm">
          <div className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Outside counsel guidelines
          </div>
          <ClauseDocument
            sourceText={base.sourceText}
            clauses={clauses}
            statusByClause={statusByClause}
            activeClauseId={activeClauseId}
            onClauseClick={selectClause}
          />
        </div>

        <div className="space-y-4">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Compiled rules
          </div>
          {clauses.length === 0 ? (
            <EmptyState
              title={stream.isRunning ? "Reading clauses…" : "No clauses yet"}
              description={
                stream.isRunning
                  ? "Clauses will appear here as the compiler finds them."
                  : "Compile this rulebook to extract clauses and generate rules."
              }
            />
          ) : (
            clauses.map((c) => {
              const rule = ruleFor(c.id) ?? null;
              const testResults: TestResult[] | undefined =
                stream.testResultsByClause[c.id] ?? rule?.testResults;
              return (
                <RuleCard
                  key={c.id}
                  clause={c}
                  rule={rule}
                  status={statusByClause[c.id]}
                  attempt={stream.statusByClause[c.id]?.attempt ?? rule?.attempts}
                  testResults={testResults}
                  active={activeClauseId === c.id}
                  onApprove={handleApprove}
                  onSelect={selectCard}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function startedCount(events: CompileEvent[]): number {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.type === "started") return ev.clauseCount;
  }
  return 0;
}
