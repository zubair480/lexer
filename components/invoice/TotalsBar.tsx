"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import type { InvoiceTotals } from "@/shared/contract";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function usd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function Tile({
  label,
  value,
  hint,
  danger,
  big,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  danger?: boolean;
  big?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card px-5 py-4 shadow-sm",
        danger && "border-red-200 bg-red-50/50",
        big && "min-w-[220px]",
      )}
    >
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 font-semibold tabular-nums tracking-tight",
          big ? "text-3xl" : "text-2xl",
          danger ? "text-red-600" : "text-foreground",
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

export function TotalsBar({
  totals,
  onRunCheck,
  isChecking,
  hasChecked,
}: {
  totals: InvoiceTotals;
  onRunCheck: () => void;
  isChecking: boolean;
  hasChecked: boolean;
}) {
  return (
    <div className="flex flex-wrap items-stretch gap-3">
      <Tile label="Billed" value={usd(totals.billed)} hint={`${totals.entryCount} entries`} />
      <Tile
        label="At risk"
        value={hasChecked ? usd(totals.atRisk) : "—"}
        hint={hasChecked ? "excludes dismissed flags" : "run a check to compute"}
        danger={hasChecked && totals.atRisk > 0}
        big
      />
      <Tile
        label="Flags"
        value={hasChecked ? totals.flaggedCount : "—"}
        hint={hasChecked ? "flagged entries" : undefined}
      />
      <Tile label="Entries" value={totals.entryCount} />
      <div className="ml-auto flex flex-col items-end justify-center gap-1.5">
        <Button size="lg" onClick={onRunCheck} disabled={isChecking} className="gap-2">
          {isChecking ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
          {isChecking ? "Checking…" : hasChecked ? "Re-run check" : "Run check"}
        </Button>
        <span className="text-xs text-muted-foreground">Checked against 6 active rules of Acme OCG</span>
      </div>
    </div>
  );
}

export default TotalsBar;
