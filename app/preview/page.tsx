"use client";

import { AppShell } from "@/components/shell/AppShell";
import { StatusBadge } from "@/components/common/StatusBadge";
import { SeverityPill } from "@/components/common/SeverityPill";
import { Money } from "@/components/common/Money";
import { StatCard } from "@/components/common/StatCard";
import { PageHeader } from "@/components/common/PageHeader";
import { RuleCard } from "@/components/rulebook/RuleCard";
import { ClauseDocument } from "@/components/rulebook/ClauseDocument";
import { EntryTable } from "@/components/invoice/EntryTable";
import { Button } from "@/components/ui/button";
import { MOCK_RULEBOOK, MOCK_INVOICE, MOCK_FLAGS } from "@/lib/client/mocks";
import type { RuleStatus, Severity } from "@/shared/contract";

const STATUSES: RuleStatus[] = [
  "pending",
  "compiling",
  "testing",
  "repairing",
  "verified",
  "uncertain",
  "needs_interpretation",
  "active",
];
const SEVERITIES: Severity[] = ["reject", "reduce", "warn"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

export default function PreviewPage() {
  const rb = MOCK_RULEBOOK;
  const statusByClause: Record<string, RuleStatus> = {};
  rb.clauses.forEach((c, i) => {
    const r = rb.rules.find((x) => x.clauseId === c.id);
    statusByClause[c.id] = i === 1 ? "repairing" : i === 2 ? "testing" : (r?.status ?? "pending");
  });
  const verifiedClause = rb.clauses[0];
  const judgmentClause = rb.clauses.find((c) => c.kind === "judgment") ?? rb.clauses[rb.clauses.length - 1];
  const flaggedEntries = MOCK_INVOICE.entries
    .filter((e) => MOCK_FLAGS.some((f) => f.entryId === e.id))
    .slice(0, 2);
  const cleanEntry = MOCK_INVOICE.entries.find((e) => !MOCK_FLAGS.some((f) => f.entryId === e.id));

  return (
    <AppShell>
      <div className="mx-auto max-w-[1400px] space-y-10 px-8 py-6">
        <PageHeader
          eyebrow="Feature 0 · Design preview"
          title="Look & feel"
          subtitle="Calm, premium legal software. Navy primary, teal for verified, serif for guideline text."
          actions={
            <>
              <Button variant="outline">Secondary</Button>
              <Button>Primary action</Button>
            </>
          }
        />

        <Section title="Rule statuses">
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <StatusBadge key={s} status={s} attempt={s === "repairing" ? 2 : undefined} />
            ))}
          </div>
        </Section>

        <Section title="Severity · money">
          <div className="flex flex-wrap items-center gap-3">
            {SEVERITIES.map((s) => (
              <SeverityPill key={s} severity={s} />
            ))}
            <Money value={4120} className="text-lg font-semibold text-red-600" />
          </div>
        </Section>

        <Section title="Stat cards">
          <div className="grid grid-cols-4 gap-4">
            <StatCard label="Billed" value={<Money value={MOCK_INVOICE.totals.billed} />} hint="20 entries" />
            <StatCard label="At risk" value={<Money value={4120} />} tone="danger" hint="6 flags" />
            <StatCard label="Rules verified" value="6 / 6" tone="success" hint="24 tests passing" />
            <StatCard label="Needs attorney" value="1" hint="§3.7 Reasonableness" />
          </div>
        </Section>

        <div className="grid grid-cols-[55fr_45fr] gap-6">
          <Section title="Clause document">
            <ClauseDocument
              sourceText={rb.sourceText}
              clauses={rb.clauses}
              statusByClause={statusByClause}
              activeClauseId={verifiedClause?.id}
            />
          </Section>
          <Section title="Rule cards">
            <div className="space-y-4">
              {verifiedClause && (
                <RuleCard
                  clause={verifiedClause}
                  rule={rb.rules.find((r) => r.clauseId === verifiedClause.id)}
                  status="verified"
                  testResults={rb.rules.find((r) => r.clauseId === verifiedClause.id)?.testResults}
                />
              )}
              {rb.clauses[1] && (
                <RuleCard clause={rb.clauses[1]} status="repairing" attempt={2} />
              )}
              {judgmentClause && <RuleCard clause={judgmentClause} status="needs_interpretation" />}
            </div>
          </Section>
        </div>

        <Section title="Flagged rows">
          <EntryTable
            entries={[...flaggedEntries, ...(cleanEntry ? [cleanEntry] : [])]}
            flags={MOCK_FLAGS}
            onSelect={() => {}}
          />
        </Section>
      </div>
    </AppShell>
  );
}
