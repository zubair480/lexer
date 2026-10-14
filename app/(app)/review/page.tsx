"use client";

import * as React from "react";
import { AlertTriangle, History, Scale, XCircle } from "lucide-react";
import type { ReviewItem } from "@/shared/contract";
import { api } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { ErrorState } from "@/components/common/ErrorState";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ReviewSection } from "@/components/review/ReviewSection";
import {
  DismissedFlagItem,
  JudgmentClauseItem,
  UncertainRuleItem,
} from "@/components/review/ReviewItems";
import { AuditTimeline } from "@/components/review/AuditTimeline";

export default function ReviewPage() {
  const review = useApi(() => api.review(), []);
  const audit = useApi(() => api.audit(), []);

  const groups = React.useMemo(() => {
    const items = review.data ?? [];
    const by = (t: ReviewItem["type"]) => items.filter((i) => i.type === t);
    return {
      uncertain: by("uncertain_rule"),
      judgment: by("judgment_clause"),
      dismissed: by("dismissed_flag"),
    };
  }, [review.data]);

  const total = groups.uncertain.length + groups.judgment.length + groups.dismissed.length;
  const refreshAudit = audit.reload;

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-6">
      <PageHeader
        eyebrow="Review queue"
        title="Human review"
        subtitle="Anything the system isn't certain about lands here. Judgment is never automated."
        actions={
          review.data ? (
            <span className="rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
              {total} item{total === 1 ? "" : "s"} awaiting attorney attention
            </span>
          ) : undefined
        }
      />

      <div className="mt-6">
        {review.loading && !review.data ? (
          <LoadingState rows={6} label="Loading review queue…" />
        ) : review.error ? (
          <ErrorState error={review.error} onRetry={review.reload} />
        ) : (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <ReviewSection
              title="Uncertain rules"
              description="Failed verification after repair attempts. Never enforced until fixed."
              count={groups.uncertain.length}
              tone="orange"
              icon={<AlertTriangle className="size-4" />}
              emptyText="Nothing uncertain — all compilable clauses verified ✓"
            >
              {groups.uncertain.map((item) => (
                <UncertainRuleItem key={item.id} item={item} onResolved={refreshAudit} />
              ))}
            </ReviewSection>

            <ReviewSection
              title="Judgment clauses"
              description="Require attorney interpretation. Not auto-enforced."
              count={groups.judgment.length}
              tone="amber"
              icon={<Scale className="size-4" />}
              emptyText="No judgment clauses in the active rulebook."
            >
              {groups.judgment.map((item) => (
                <JudgmentClauseItem key={item.id} item={item} />
              ))}
            </ReviewSection>

            <ReviewSection
              title="Dismissed flags"
              description="Flags a reviewer overrode, with their reasoning."
              count={groups.dismissed.length}
              tone="slate"
              icon={<XCircle className="size-4" />}
              emptyText="No dismissed flags — every flag is open or accepted."
            >
              {groups.dismissed.map((item) => (
                <DismissedFlagItem key={item.id} item={item} onReopened={refreshAudit} />
              ))}
            </ReviewSection>
          </div>
        )}
      </div>

      <Card className="mt-8 rounded-xl shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <History className="size-4 text-muted-foreground" />
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Audit trail
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Every approval, check, and override — who, what, and when.
          </p>
        </CardHeader>
        <CardContent className="pt-4">
          {audit.loading && !audit.data ? (
            <LoadingState rows={4} label="Loading audit trail…" />
          ) : audit.error ? (
            <ErrorState error={audit.error} onRetry={audit.reload} />
          ) : (
            <AuditTimeline entries={audit.data ?? []} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
