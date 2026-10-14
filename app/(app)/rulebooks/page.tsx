"use client";

import Link from "next/link";
import { BookOpen, ChevronRight, Plus } from "lucide-react";
import type { RuleStatus, RulebookSummary } from "@/shared/contract";
import { api } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { LoadingState } from "@/components/common/LoadingState";
import { ErrorState } from "@/components/common/ErrorState";
import { EmptyState } from "@/components/common/EmptyState";

const STATUS_ORDER: RuleStatus[] = [
  "active",
  "verified",
  "uncertain",
  "needs_interpretation",
  "repairing",
  "testing",
  "compiling",
  "pending",
];

const RECORD_TYPE_LABEL: Record<string, string> = {
  time_entry: "Time entries",
  h1b_petition: "H-1B petitions",
};

function RulebookCard({ rb }: { rb: RulebookSummary }) {
  const counts = STATUS_ORDER.filter((s) => (rb.statusCounts[s] ?? 0) > 0);
  return (
    <Link
      href={`/rulebooks/${rb.id}`}
      className="group flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm transition hover:border-foreground/20 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="truncate text-base font-semibold text-foreground">{rb.title}</div>
          <div className="text-sm text-muted-foreground">{rb.clientName}</div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline" className="font-normal">
          {RECORD_TYPE_LABEL[rb.recordType] ?? rb.recordType}
        </Badge>
        <span>{rb.clauseCount} clauses</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {counts.length === 0 ? (
          <span className="text-xs text-muted-foreground">Not compiled yet</span>
        ) : (
          counts.map((s) => (
            <span key={s} className="inline-flex items-center gap-1">
              <StatusBadge status={s} />
              <span className="text-xs tabular-nums text-muted-foreground">×{rb.statusCounts[s]}</span>
            </span>
          ))
        )}
      </div>
    </Link>
  );
}

export default function RulebooksPage() {
  const { data, error, loading, reload } = useApi(() => api.listRulebooks(), []);

  const newButton = (
    <Button asChild>
      <Link href="/rulebooks/new">
        <Plus className="mr-2 h-4 w-4" /> New rulebook
      </Link>
    </Button>
  );

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-6">
      <PageHeader
        eyebrow="Guidelines"
        title="Rulebooks"
        subtitle="Client billing guidelines compiled into tested, attorney-approved rules."
        actions={newButton}
      />
      <div className="mt-6">
        {loading && !data ? (
          <LoadingState rows={4} label="Loading rulebooks..." />
        ) : error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="h-6 w-6" />}
            title="No rulebooks yet"
            description="Paste a client's outside counsel guidelines to create your first rulebook."
            action={newButton}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.map((rb) => (
              <RulebookCard key={rb.id} rb={rb} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
