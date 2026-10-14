"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import type { Flag, Invoice, InvoiceTotals, Rulebook } from "@/shared/contract";
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
  const [rulebooks, setRulebooks] = useState<Rulebook[]>([]);
  const [rulebookId, setRulebookId] = useState<string>(DEMO.rulebookId);
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
      const [inv, fl, summaries] = await Promise.all([
        api.getInvoice(id),
        api.getInvoiceFlags(id).catch(() => [] as Flag[]),
        api.listRulebooks().catch(() => []),
      ]);
      // Invoices hold time entries, so only time-entry rulebooks can check them.
      const books = (
        await Promise.all(
          summaries.filter((r) => r.recordType === "time_entry").map((r) => api.getRulebook(r.id).catch(() => null)),
        )
      ).filter((r): r is Rulebook => r !== null);
      // Default: the rulebook that produced existing flags, else the demo rulebook, else one with approved rules.
      const owner = books.find((b) => fl.some((f) => b.rules.some((r) => r.id === f.ruleId)));
      const fallback =
        books.find((b) => b.id === DEMO.rulebookId) ?? books.find((b) => b.rules.some((r) => r.status === "active")) ?? books[0];
      const chosen = owner ?? fallback;
      const chosenRuleIds = new Set(chosen?.rules.map((r) => r.id) ?? []);
      const own = fl.filter((f) => chosenRuleIds.has(f.ruleId));
      setRulebooks(books);
      if (chosen) setRulebookId(chosen.id);
      setInvoice(inv);
      setBaseTotals(inv.totals);
      setFlags(own);
      setHasChecked(own.length > 0);
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

  const rulebook = rulebooks.find((r) => r.id === rulebookId) ?? null;
  const activeRules = rulebook?.rules.filter((r) => r.status === "active").length ?? 0;
  const clauses = useMemo(() => rulebooks.flatMap((r) => r.clauses), [rulebooks]);

  const switchRulebook = async (rid: string) => {
    setRulebookId(rid);
    setSelectedEntryId(null);
    setPanelOpen(false);
    const book = rulebooks.find((r) => r.id === rid);
    const ruleIds = new Set(book?.rules.map((r) => r.id) ?? []);
    const fl = await api.getInvoiceFlags(id).catch(() => [] as Flag[]);
    const own = fl.filter((f) => ruleIds.has(f.ruleId));
    setFlags(own);
    setHasChecked(own.length > 0);
  };

  const runCheck = async () => {
    if (rulebook && activeRules === 0) {
      toast.error("No approved rules in this rulebook", {
        description: "Compile it and approve the verified rules first.",
      });
      return;
    }
    setChecking(true);
    try {
      const res = await api.checkInvoice(id, rulebookId);
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
        subtitle={
          rulebook
            ? `${rulebook.clientName} · checked against ${rulebook.title} · ${activeRules} approved rule${activeRules === 1 ? "" : "s"}`
            : "Choose a rulebook to check against"
        }
        actions={
          rulebooks.length > 0 ? (
            <label className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Rulebook
              <select
                value={rulebookId}
                onChange={(e) => void switchRulebook(e.target.value)}
                disabled={checking}
                className="h-9 max-w-[340px] rounded-md border bg-background px-3 text-sm font-normal normal-case tracking-normal text-foreground shadow-sm"
              >
                {rulebooks.map((r) => {
                  const n = r.rules.filter((x) => x.status === "active").length;
                  return (
                    <option key={r.id} value={r.id}>
                      {r.title} {n ? `(${n} active)` : "(not approved)"}
                    </option>
                  );
                })}
              </select>
            </label>
          ) : undefined
        }
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
