"use client";

import { Check, X } from "lucide-react";
import type { TestResult } from "@/shared/contract";
import { cn } from "@/lib/utils";

function Outcome({ flagged }: { flagged: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
        flagged
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-slate-200 bg-slate-50 text-slate-600",
      )}
    >
      {flagged ? "Flag" : "Pass"}
    </span>
  );
}

export function TestTable({ results }: { results: TestResult[] }) {
  if (!results || results.length === 0) {
    return <p className="text-xs text-muted-foreground">No test results yet.</p>;
  }
  const passed = results.filter((r) => r.passed).length;
  const all = passed === results.length;
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <table className="w-full text-xs">
        <thead className="bg-muted/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Test</th>
            <th className="px-3 py-2 font-medium">Expected</th>
            <th className="px-3 py-2 font-medium">Actual</th>
            <th className="w-10 px-3 py-2 text-center font-medium">✓</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <tr key={`${r.name}-${i}`} className={cn("border-t", !r.passed && "bg-red-50/50")}>
              <td className="px-3 py-1.5 text-foreground">{r.name}</td>
              <td className="px-3 py-1.5"><Outcome flagged={r.expectFlagged} /></td>
              <td className="px-3 py-1.5"><Outcome flagged={r.actualFlagged} /></td>
              <td className="px-3 py-1.5 text-center">
                {r.passed ? (
                  <Check className="mx-auto size-4 text-emerald-600" aria-label="passed" />
                ) : (
                  <X className="mx-auto size-4 text-red-600" aria-label="failed" />
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted/30">
            <td colSpan={4} className={cn("px-3 py-1.5 text-right font-medium", all ? "text-emerald-700" : "text-red-700")}>
              {passed}/{results.length} passed
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default TestTable;
