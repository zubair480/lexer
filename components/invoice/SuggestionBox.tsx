"use client";

import { CheckCircle2, AlertCircle, Sparkles } from "lucide-react";
import type { Flag } from "@/shared/contract";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function fmtMoney(v: number | undefined) {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

export interface SuggestionBoxProps {
  flag: Flag;
  onFlagUpdated: (flag: Flag) => void;
  loading?: boolean;
  /** original narrative of the entry, used for the before/after diff */
  originalNarrative?: string;
}

export function SuggestionBox({ flag, loading, originalNarrative }: SuggestionBoxProps) {
  const s = flag.suggestion;

  if (loading) {
    return (
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 animate-pulse" /> Generating suggestion…
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    );
  }

  if (!s) return null;

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" /> Suggested fix
        </div>
        {s.verified ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> ✓ Verified against all active rules
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            <AlertCircle className="h-3.5 w-3.5" /> Not verified — review manually
          </span>
        )}
      </div>

      {s.explanation && <p className="mb-3 text-sm text-foreground/90">{s.explanation}</p>}

      {s.narrative && (
        <div className="space-y-2 text-sm">
          {originalNarrative && (
            <div className="rounded-lg border border-red-100 bg-red-50/60 px-3 py-2">
              <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-700/80">Before</div>
              <p className="text-red-900/70 line-through decoration-red-400/70">{originalNarrative}</p>
            </div>
          )}
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2">
            <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700/80">After</div>
            <p className="text-emerald-950">{s.narrative}</p>
          </div>
        </div>
      )}

      {s.splitEntries && s.splitEntries.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">Hours</th>
                <th className="px-3 py-1.5 text-left font-medium">Narrative</th>
                <th className="px-3 py-1.5 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {s.splitEntries.map((e, i) => (
                <tr key={e.id ?? i} className={cn("border-t", "bg-emerald-50/30")}>
                  <td className="px-3 py-1.5 tabular-nums">{e.hours != null ? e.hours.toFixed(1) : "—"}</td>
                  <td className="px-3 py-1.5">{e.narrative ?? "—"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {fmtMoney(e.amount ?? (e.hours != null && e.rate != null ? e.hours * e.rate : undefined))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default SuggestionBox;
