"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Loader2,
  Scale,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import type { Clause, CompiledRule, RuleStatus, TestResult } from "@/shared/contract";
import { DEMO } from "@/shared/contract";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/StatusBadge";
import { SeverityPill } from "@/components/common/SeverityPill";
import { IN_PROGRESS } from "@/lib/client/theme";
import { cn } from "@/lib/utils";
import { TestTable } from "./TestTable";
import { RuleJson } from "./RuleJson";
import { summarizeRule } from "./ruleSummary";

export interface RuleCardProps {
  clause: Clause;
  rule?: CompiledRule | null;
  status: RuleStatus;
  attempt?: number;
  testResults?: TestResult[];
  active?: boolean;
  onApprove?: (ruleId: string) => Promise<void> | void;
  onSelect?: (clauseId: string) => void;
}

const STRIPE: Record<RuleStatus, string> = {
  pending: "bg-slate-300",
  compiling: "bg-blue-500",
  testing: "bg-blue-500",
  repairing: "bg-violet-500",
  verified: "bg-emerald-500",
  uncertain: "bg-orange-500",
  needs_interpretation: "bg-amber-500",
  active: "bg-[#1E2A4A]",
};

const MAX_ATTEMPTS = 3;

function formatTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function RuleCard({
  clause,
  rule,
  status,
  attempt,
  testResults,
  active,
  onApprove,
  onSelect,
}: RuleCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [approving, setApproving] = useState(false);
  const [flash, setFlash] = useState(false);
  const prevStatus = useRef<RuleStatus>(status);

  const inProgress = IN_PROGRESS.includes(status);
  const results = testResults ?? rule?.testResults ?? [];
  const attemptNo = attempt ?? rule?.attempts ?? 0;
  const dsl = rule?.dsl ?? null;

  // Collapse details while in progress; flash ring on transition to verified.
  useEffect(() => {
    if (inProgress) setExpanded(false);
    if (status === "verified" && prevStatus.current !== "verified") {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 900);
      prevStatus.current = status;
      return () => clearTimeout(t);
    }
    prevStatus.current = status;
  }, [status, inProgress]);

  const handleApprove = async (e: MouseEvent) => {
    e.stopPropagation();
    if (!rule || !onApprove || approving) return;
    setApproving(true);
    try {
      await onApprove(rule.id);
    } finally {
      setApproving(false);
    }
  };

  const passed = results.filter((r) => r.passed).length;
  const failing = results.filter((r) => !r.passed);
  const canExpand = !inProgress && (results.length > 0 || !!dsl);

  return (
    <div
      id={"rule-card-" + clause.id}
      className={cn(
        "relative overflow-hidden rounded-xl border bg-card shadow-sm transition-all duration-300",
        active && "ring-2 ring-[#1E2A4A]/30",
        flash && "ring-4 ring-emerald-400/60",
      )}
    >
      <div className={cn("absolute inset-y-0 left-0 w-1 transition-colors duration-500", STRIPE[status])} />

      {/* Header */}
      <button
        type="button"
        onClick={() => onSelect?.(clause.id)}
        className="flex w-full items-start gap-3 py-3 pl-5 pr-4 text-left hover:bg-muted/30"
      >
        <span className="mt-0.5 shrink-0 rounded-md border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
          §{clause.number}
        </span>
        <span className="min-w-0 flex-1 truncate pt-0.5 text-sm font-medium text-foreground">
          {clause.title}
        </span>
        <StatusBadge status={status} attempt={attemptNo || undefined} className="shrink-0" />
      </button>

      {/* Body */}
      <div className="pb-3 pl-5 pr-4 text-sm">
        {status === "pending" && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" /> Waiting…
          </p>
        )}

        {status === "compiling" && (
          <div className="space-y-2">
            <div className="space-y-1.5">
              <div className="h-2.5 w-11/12 animate-pulse rounded bg-blue-100" />
              <div className="h-2.5 w-3/4 animate-pulse rounded bg-blue-100" />
              <div className="h-2.5 w-1/2 animate-pulse rounded bg-blue-100" />
            </div>
            <p className="flex items-center gap-1.5 text-xs text-blue-700">
              <Loader2 className="size-3.5 animate-spin" /> Compiling clause into a typed rule…
            </p>
          </div>
        )}

        {status === "testing" && (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs text-blue-700">
              <Loader2 className="size-3.5 animate-spin" />
              Running {rule?.tests.length || results.length || 4} tests
            </p>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: Math.max(rule?.tests.length || 0, results.length, 4) }).map((_, i) => {
                const r = results[i];
                return (
                  <span
                    key={i}
                    className={cn(
                      "size-2.5 rounded-full transition-colors",
                      !r && "animate-pulse bg-blue-200",
                      r?.passed && "bg-emerald-500",
                      r && !r.passed && "bg-red-500",
                    )}
                  />
                );
              })}
            </div>
          </div>
        )}

        {status === "repairing" && (
          <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-800">
            <p className="flex items-center gap-1.5 font-medium">
              <Wrench className="size-3.5" />
              Test failed → repairing (attempt {Math.max(attemptNo, 1)} of {MAX_ATTEMPTS})
            </p>
            {failing.length > 0 && (
              <p className="mt-1 text-violet-700">
                Failing: <span className="font-mono">{failing.map((f) => f.name).join(", ")}</span>
              </p>
            )}
          </div>
        )}

        {status === "verified" && (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="size-4" />
                Passed {passed}/{results.length || passed} tests
              </span>
              {dsl && <SeverityPill severity={dsl.severity} />}
            </div>
            {dsl && <p className="text-sm leading-relaxed text-slate-700">{summarizeRule(dsl)}</p>}
            {rule && onApprove && (
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={approving}
                className="bg-[#1E2A4A] text-white hover:bg-[#1E2A4A]/90"
              >
                {approving ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
                {approving ? "Approving…" : "Approve rule"}
              </Button>
            )}
          </div>
        )}

        {status === "active" && (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-medium text-[#1E2A4A]">
              <ShieldCheck className="size-4" />
              Active · approved by {rule?.approvedBy ?? DEMO.approver}
              {rule?.approvedAt ? ` · ${formatTime(rule.approvedAt)}` : ""}
            </p>
            {dsl && <p className="text-sm leading-relaxed text-slate-700">{summarizeRule(dsl)}</p>}
          </div>
        )}

        {status === "needs_interpretation" && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <p className="flex items-center gap-1.5 font-medium">
              <Scale className="size-4" />
              Needs attorney interpretation — not auto-enforced
            </p>
            {clause.kindReason && <p className="mt-1 text-amber-800">{clause.kindReason}</p>}
          </div>
        )}

        {status === "uncertain" && (
          <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800">
            <p className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="size-4" />
              Couldn&apos;t verify after {MAX_ATTEMPTS} attempts → sent to review
            </p>
            {failing.length > 0 && (
              <p className="mt-1">
                Failing: <span className="font-mono">{failing.map((f) => f.name).join(", ")}</span>
              </p>
            )}
          </div>
        )}

        {/* Details */}
        {canExpand && (
          <div className="mt-3">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((x) => !x);
              }}
              className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
              Details
            </button>
            {expanded && (
              <div className="mt-2 space-y-2 animate-in fade-in-0 slide-in-from-top-1">
                {results.length > 0 && <TestTable results={results} />}
                {dsl && <RuleJson rule={dsl} />}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default RuleCard;
