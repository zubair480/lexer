"use client";

import { CheckCircle2, FlaskConical, MinusCircle, PlusCircle } from "lucide-react";

import type { EvalResult } from "@/shared/contract";
import { api } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import { cn } from "@/lib/utils";
import { LoadingState } from "@/components/common/LoadingState";
import { ErrorState } from "@/components/common/ErrorState";
import { EmptyState } from "@/components/common/EmptyState";
import { MetricBar, metricTone } from "@/components/invoice/MetricBar";

const SECTION_LABEL = "text-xs font-medium uppercase tracking-wider text-muted-foreground";

function ScoreRing({ ratio }: { ratio: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, ratio));
  const tone = metricTone(v);
  const stroke =
    v >= 0.9 ? "stroke-emerald-500" : v >= 0.7 ? "stroke-amber-500" : "stroke-red-500";
  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" className="stroke-muted" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          className={cn(stroke, "transition-[stroke-dashoffset] duration-1000 ease-out")}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("text-2xl font-semibold tabular-nums", tone.text)}>
          {Math.round(v * 100)}%
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">accuracy</span>
      </div>
    </div>
  );
}

function ClausePill({ clause, tone }: { clause: string; tone: "neutral" | "missed" | "extra" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[11px]",
        tone === "neutral" && "border-slate-200 bg-slate-50 text-slate-700",
        tone === "missed" && "border-red-200 bg-red-50 text-red-700",
        tone === "extra" && "border-amber-300 bg-amber-50 text-amber-800",
      )}
    >
      §{clause}
    </span>
  );
}

function PillList({
  clauses,
  highlight,
  highlightTone,
}: {
  clauses: string[];
  highlight: Set<string>;
  highlightTone: "missed" | "extra";
}) {
  if (clauses.length === 0) return <span className="text-xs italic text-muted-foreground">none</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {clauses.map((c) => (
        <ClausePill key={c} clause={c} tone={highlight.has(c) ? highlightTone : "neutral"} />
      ))}
    </div>
  );
}

function EvalBody({ data }: { data: EvalResult }) {
  const ratio = data.total > 0 ? data.correct / data.total : 0;
  const perRule = [...data.perRule].sort((a, b) =>
    a.clauseNumber.localeCompare(b.clauseNumber, undefined, { numeric: true }),
  );

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-8">
          <ScoreRing ratio={ratio} />
          <div className="min-w-0 flex-1">
            <p className={SECTION_LABEL}>Accuracy vs. golden set</p>
            <div className="mt-1 flex items-baseline gap-3">
              <span className="text-5xl font-semibold tracking-tight tabular-nums text-foreground">
                {data.correct}
                <span className="text-muted-foreground"> / {data.total}</span>
              </span>
            </div>
            <p className="mt-1 text-base text-foreground">
              entries match the hand-labeled golden set
            </p>
            <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
              <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Golden set: {data.total} entries labeled by an attorney. Deterministic engine — same
                input, same answer.
              </span>
            </p>
          </div>
        </div>
      </section>

      {/* Per-rule table */}
      <section className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-6 py-4">
          <p className={SECTION_LABEL}>Per-rule precision &amp; recall</p>
        </div>
        {perRule.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No rule metrics" description="No active rules were evaluated." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Clause</th>
                  <th className="px-3 py-3 font-medium">Rule</th>
                  <th className="px-3 py-3 font-medium">TP / FP / FN</th>
                  <th className="px-3 py-3 font-medium">Precision</th>
                  <th className="px-6 py-3 font-medium">Recall</th>
                </tr>
              </thead>
              <tbody>
                {perRule.map((row) => (
                  <tr key={row.ruleId} className="border-t transition-colors hover:bg-muted/40">
                    <td className="px-6 py-3 font-mono text-xs font-medium text-foreground">
                      §{row.clauseNumber}
                    </td>
                    <td className="px-3 py-3 text-foreground">{row.title}</td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-muted-foreground">
                      <span className="text-emerald-700">{row.tp}</span>
                      {" / "}
                      <span className={row.fp > 0 ? "text-amber-700" : undefined}>{row.fp}</span>
                      {" / "}
                      <span className={row.fn > 0 ? "text-red-700" : undefined}>{row.fn}</span>
                    </td>
                    <td className="px-3 py-3">
                      <MetricBar value={row.precision} label={`Precision §${row.clauseNumber}`} />
                    </td>
                    <td className="px-6 py-3">
                      <MetricBar value={row.recall} label={`Recall §${row.clauseNumber}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Mismatches */}
      <section className="rounded-xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <p className={SECTION_LABEL}>Mismatches</p>
          <span className="text-xs text-muted-foreground">
            {data.mismatches.length} of {data.total}
          </span>
        </div>
        {data.mismatches.length === 0 ? (
          <div className="flex items-center gap-2 px-6 py-5 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            Every labeled entry matches the golden set.
          </div>
        ) : (
          <ul className="divide-y">
            {data.mismatches.map((m) => {
              const expected = new Set(m.expected);
              const actual = new Set(m.actual);
              const missed = new Set(m.expected.filter((c) => !actual.has(c)));
              const extra = new Set(m.actual.filter((c) => !expected.has(c)));
              return (
                <li key={m.entryId} className="grid grid-cols-[140px_1fr_1fr_auto] items-center gap-4 px-6 py-4">
                  <span className="font-mono text-xs font-medium text-foreground">{m.entryId}</span>
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      Expected
                    </p>
                    <PillList clauses={m.expected} highlight={missed} highlightTone="missed" />
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      Engine
                    </p>
                    <PillList clauses={m.actual} highlight={extra} highlightTone="extra" />
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {missed.size > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
                        <MinusCircle className="h-3.5 w-3.5" />
                        Missed {[...missed].map((c) => `§${c}`).join(", ")}
                      </span>
                    )}
                    {extra.size > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800">
                        <PlusCircle className="h-3.5 w-3.5" />
                        Extra {[...extra].map((c) => `§${c}`).join(", ")}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

export function EvalTab({ invoiceId }: { invoiceId: string }) {
  const { data, error, loading, reload } = useApi(() => api.evalInvoice(invoiceId), [invoiceId]);

  if (loading && !data) return <LoadingState rows={6} label="Scoring against the golden set…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data || data.total === 0)
    return (
      <EmptyState
        icon={<FlaskConical className="h-5 w-5" />}
        title="No golden set for this invoice"
        description="Evaluation runs against attorney-labeled entries. This invoice has none yet."
      />
    );
  return <EvalBody data={data} />;
}

export default EvalTab;
