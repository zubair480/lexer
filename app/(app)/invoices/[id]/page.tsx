"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import type { Clause, Flag, Invoice, InvoiceTotals } from "@/shared/contract";
import { DEMO } from "@/shared/contract";
import { api } from "@/lib/client/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { ErrorState } from "@/components/common/ErrorState";
import { EntryTable } from "@/components/invoice/EntryTable";
import { TotalsBar } from "@/components/invoice/TotalsBar";
import { FlagPanel } from "@/components/invoice/FlagPanel";
import { EvalTab } from "@/components/invoice/EvalTab";

function usd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function periodLabel(period: string) {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}

function computeTotals(base: InvoiceTotals, flags: Flag[]): InvoiceTotals {
  const live = flags.filter((f) => f.status !== "dismissed");
  const atRisk = live.reduce((s, f) => s + f.impactUsd, 0);
  return {
    ...base,
    atRisk,
    flaggedCount: new Set(live.map((f) => f.entryId)).size,
  };
}

export default function InvoicePage() {
  const params = useParams<{ id: string }>();
  const id = (Array.isArray(params?.id) ? params.id[0] : params?.id) ?? DEMO.invoiceId;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [clauses, setClauses] = useState<Clause[]>([]);
  const [baseTotals, setBaseTotals] = useState<InvoiceTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [checking, setChecking] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [inv, fl] = await Promise.all([api.getInvoice(id), api.getInvoiceFlags(id).catch(() => [] as Flag[])]);
      setInvoice(inv);
      setBaseTotals(inv.totals);
      setFlags(fl);
      setHasChecked(fl.length > 0);
      api
        .getRulebook(DEMO.rulebookId)
        .then((rb) => setClauses(rb.clauses))
        .catch(() => setClauses([]));
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo<InvoiceTotals | null>(() => {
    if (!baseTotals) return null;
    return hasChecked ? computeTotals(baseTotals, flags) : baseTotals;
  }, [baseTotals, flags, hasChecked]);

  const runCheck = async () => {
    setChecking(true);
    try {
      const res = await api.checkInvoice(id);
      setFlags(res.flags);
      setBaseTotals(res.totals);
      setHasChecked(true);
      const t = computeTotals(res.totals, res.flags);
      toast.success(`${res.flags.length} flags · ${usd(t.atRisk)} at risk`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Check failed");
    } finally {
      setChecking(false);
    }
  };

  const onFlagUpdated = (flag: Flag) => {
    setFlags((prev) => prev.map((f) => (f.id === flag.id ? flag : f)));
  };

  const selectedEntry = invoice?.entries.find((e) => e.id === selectedEntryId) ?? null;
  const selectedFlags = flags.filter((f) => f.entryId === selectedEntryId);

  const title = invoice
    ? `Invoice · ${periodLabel(invoice.period)} · ${invoice.matterId}`
    : `Invoice · October 2026 · ${DEMO.matterId}`;

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-6">
      <PageHeader
        eyebrow="Invoice check"
        title={title}
        subtitle={`${DEMO.clientName} · checked against Acme Outside Counsel Guidelines`}
      />

      {loading ? (
        <LoadingState rows={8} label="Loading invoice…" />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void load()} />
      ) : !invoice || !totals ? (
        <ErrorState error="Invoice not found" onRetry={() => void load()} />
      ) : (
        <Tabs defaultValue="entries" className="mt-4">
          <TabsList>
            <TabsTrigger value="entries">Entries</TabsTrigger>
            <TabsTrigger value="eval">Evaluation</TabsTrigger>
          </TabsList>
          <TabsContent value="entries" className="mt-4 space-y-5">
            <TotalsBar totals={totals} onRunCheck={() => void runCheck()} isChecking={checking} hasChecked={hasChecked} />
            <EntryTable
              entries={invoice.entries}
              flags={flags}
              selectedEntryId={selectedEntryId}
              onSelect={(eid) => {
                setSelectedEntryId(eid);
                setPanelOpen(true);
              }}
            />
          </TabsContent>
          <TabsContent value="eval" className="mt-4">
            <EvalTab invoiceId={id} />
          </TabsContent>
        </Tabs>
      )}

      <FlagPanel
        open={panelOpen}
        onOpenChange={(o) => {
          setPanelOpen(o);
          if (!o) setSelectedEntryId(null);
        }}
        entry={selectedEntry}
        flags={selectedFlags}
        clauses={clauses}
        onFlagUpdated={onFlagUpdated}
      />
    </div>
  );
}
