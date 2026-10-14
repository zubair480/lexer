"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, FileText, Upload } from "lucide-react";
import type { InvoiceSummary } from "@/shared/contract";
import { api } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { ErrorState } from "@/components/common/ErrorState";

function usd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function periodLabel(period: string) {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}

export default function InvoicesPage() {
  const [items, setItems] = useState<InvoiceSummary[] | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setItems(null);
    try {
      setItems(await api.listInvoices());
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-6">
      <PageHeader
        eyebrow="Invoices"
        title="Invoices"
        subtitle="Outside counsel invoices checked against active billing rules"
        actions={
          <Button asChild className="gap-2">
            <Link href="/invoices/new">
              <Upload className="size-4" /> Upload invoice
            </Link>
          </Button>
        }
      />
      <div className="mt-6">
        {error ? (
          <ErrorState error={error} onRetry={() => void load()} />
        ) : !items ? (
          <LoadingState rows={3} label="Loading invoices…" />
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card px-6 py-14 text-center">
            <FileText className="mx-auto size-8 text-muted-foreground" />
            <div className="mt-3 font-medium">No invoices yet</div>
            <p className="mt-1 text-sm text-muted-foreground">Upload a LEDES-style CSV to get started.</p>
            <Button asChild className="mt-4">
              <Link href="/invoices/new">Upload invoice</Link>
            </Button>
          </div>
        ) : (
          <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm">
            {items.map((inv) => (
              <Link
                key={inv.id}
                href={`/invoices/${inv.id}`}
                className="flex items-center gap-6 px-5 py-4 transition-colors hover:bg-muted/50"
              >
                <FileText className="size-5 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {periodLabel(inv.period)} · <span className="font-mono text-sm">{inv.matterId}</span>
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {inv.totals.entryCount} entries · {inv.totals.flaggedCount} flagged
                  </div>
                </div>
                <div className="text-right tabular-nums">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Billed</div>
                  <div className="font-medium">{usd(inv.totals.billed)}</div>
                </div>
                <div className="w-28 text-right tabular-nums">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">At risk</div>
                  <div className={inv.totals.atRisk > 0 ? "font-semibold text-red-600" : "font-medium"}>
                    {usd(inv.totals.atRisk)}
                  </div>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
