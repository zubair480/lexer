"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, FileSpreadsheet } from "lucide-react";
import { api } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import { DEMO } from "@/shared/contract";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { ErrorState } from "@/components/common/ErrorState";
import { EmptyState } from "@/components/common/EmptyState";
import { ClientCard } from "@/components/dashboard/ClientCard";
import { RulebookCard } from "@/components/dashboard/RulebookCard";
import { InvoiceCard } from "@/components/dashboard/InvoiceCard";
import { HowItWorks } from "@/components/dashboard/HowItWorks";

export default function DashboardPage() {
  const { data, error, loading, reload } = useApi(() => api.dashboard(), []);

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-6">
      <PageHeader
        eyebrow={`${data?.client.name ?? DEMO.clientName} · Outside counsel guidelines`}
        title="Pre-bill compliance"
        subtitle="Catch guideline violations before the client does. Every flag traces back to the clause it enforces."
      />

      <div className="mt-6 space-y-6">
        {loading && !data ? (
          <LoadingState rows={3} label="Loading dashboard…" />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : data ? (
          <>
            <div className="grid gap-6 lg:grid-cols-3">
              <ClientCard clientName={data.client.name} matterId={data.latestInvoice?.matterId} />

              {data.rulebook ? (
                <RulebookCard rulebook={data.rulebook} />
              ) : (
                <div className="rounded-xl border bg-card shadow-sm">
                  <EmptyState
                    icon={<BookOpen className="h-6 w-6" />}
                    title="No rulebook yet"
                    description="Paste the client's outside counsel guidelines to compile them into tested rules."
                    action={
                      <Button asChild>
                        <Link href="/rulebooks/new">Create rulebook</Link>
                      </Button>
                    }
                  />
                </div>
              )}

              {data.latestInvoice ? (
                <InvoiceCard invoice={data.latestInvoice} />
              ) : (
                <div className="rounded-xl border bg-card shadow-sm">
                  <EmptyState
                    icon={<FileSpreadsheet className="h-6 w-6" />}
                    title="No invoices yet"
                    description="Upload a CSV of time entries to check it against the rulebook."
                    action={
                      <Button asChild>
                        <Link href="/invoices/new">Upload invoice</Link>
                      </Button>
                    }
                  />
                </div>
              )}
            </div>

            <HowItWorks />

            <div className="flex justify-end">
              <Link
                href={`/rulebooks/${DEMO.uscisRulebookId}`}
                className="group inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Try another rulebook: USCIS H-1B checklist
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
