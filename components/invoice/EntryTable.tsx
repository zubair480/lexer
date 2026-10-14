"use client";

import { useMemo, useState } from "react";
import type { Flag, Severity, TimeEntry } from "@/shared/contract";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SEVERITY_META } from "@/lib/client/theme";
import { cn } from "@/lib/utils";

const SEV_RANK: Record<Severity, number> = { reject: 3, reduce: 2, warn: 1 };

function usd(n: number, decimals: 0 | 2 = 0) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function worstSeverity(flags: Flag[]): Severity | null {
  let worst: Severity | null = null;
  for (const f of flags) {
    if (!worst || SEV_RANK[f.severity] > SEV_RANK[worst]) worst = f.severity;
  }
  return worst;
}

function SevPill({ severity }: { severity: Severity }) {
  const m = SEVERITY_META[severity];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        m.pill,
      )}
    >
      {m.label}
    </span>
  );
}

export function EntryTable({
  entries,
  flags,
  selectedEntryId,
  onSelect,
}: {
  entries: TimeEntry[];
  flags: Flag[];
  selectedEntryId?: string | null;
  onSelect: (entryId: string) => void;
}) {
  const [filter, setFilter] = useState<"all" | "flagged">("all");

  const flagsByEntry = useMemo(() => {
    const m: Record<string, Flag[]> = {};
    for (const f of flags) (m[f.entryId] ??= []).push(f);
    return m;
  }, [flags]);

  const flaggedCount = entries.filter((e) => flagsByEntry[e.id]?.length).length;
  const visible = filter === "flagged" ? entries.filter((e) => flagsByEntry[e.id]?.length) : entries;

  const chip = (key: "all" | "flagged", label: string, count: number) => (
    <button
      type="button"
      onClick={() => setFilter(key)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        filter === key
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-background text-muted-foreground hover:bg-muted",
      )}
    >
      {label}
      <span className="tabular-nums opacity-80">{count}</span>
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {chip("all", "All", entries.length)}
        {chip("flagged", "Flagged only", flaggedCount)}
      </div>
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Table className="tabular-nums">
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-[96px]">Date</TableHead>
              <TableHead>Timekeeper</TableHead>
              <TableHead className="text-right">Hours</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Codes</TableHead>
              <TableHead className="w-[34%]">Narrative</TableHead>
              <TableHead>Flags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                  {filter === "flagged" ? "No flagged entries. Run a check to find issues." : "No entries."}
                </TableCell>
              </TableRow>
            ) : (
              visible.map((e) => {
                const ef = flagsByEntry[e.id] ?? [];
                const worst = worstSeverity(ef.filter((f) => f.status === "open"));
                const selected = selectedEntryId === e.id;
                return (
                  <TableRow
                    key={e.id}
                    onClick={() => onSelect(e.id)}
                    className={cn(
                      "cursor-pointer border-l-4 border-l-transparent",
                      worst && SEVERITY_META[worst].row,
                      worst && SEVERITY_META[worst].accent,
                      selected && "ring-2 ring-inset ring-primary/60",
                    )}
                  >
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{e.date}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="text-sm font-medium text-foreground">{e.timekeeperName}</div>
                      <div className="text-xs capitalize text-muted-foreground">{e.role}</div>
                    </TableCell>
                    <TableCell className="text-right text-sm">{e.hours.toFixed(1)}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">{usd(e.rate)}</TableCell>
                    <TableCell className="text-right text-sm font-medium">{usd(e.amount, 2)}</TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                      {e.taskCode} · {e.activityCode}
                    </TableCell>
                    <TableCell className="max-w-0">
                      <div className="truncate text-sm" title={e.narrative}>
                        {e.narrative}
                      </div>
                    </TableCell>
                    <TableCell>
                      {ef.length === 0 ? (
                        <span className="text-xs text-muted-foreground/60">—</span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1">
                          {ef.map((f) => {
                            const muted = f.status !== "open";
                            return (
                              <span
                                key={f.id}
                                title={`${f.ruleTitle} — ${f.status}`}
                                className={cn(
                                  "inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-medium",
                                  muted
                                    ? "border-slate-200 bg-slate-50 text-slate-400 line-through"
                                    : SEVERITY_META[f.severity].pill,
                                )}
                              >
                                §{f.clauseNumber}
                              </span>
                            );
                          })}
                          {worst ? <SevPill severity={worst} /> : null}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default EntryTable;
