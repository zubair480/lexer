"use client";

import Link from "next/link";
import { BookOpenCheck, ArrowRight } from "lucide-react";
import type { RuleStatus, RulebookSummary } from "@/shared/contract";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/StatusBadge";

const ORDER: RuleStatus[] = [
  "active",
  "verified",
  "needs_interpretation",
  "uncertain",
  "repairing",
  "testing",
  "compiling",
  "pending",
];

export function RulebookCard({ rulebook }: { rulebook: RulebookSummary }) {
  const present = ORDER.filter((s) => (rulebook.statusCounts[s] ?? 0) > 0);
  return (
    <Card className="flex flex-col rounded-xl shadow-sm">
      <CardHeader className="pb-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Rulebook</p>
        <CardTitle className="flex items-start gap-3 text-lg font-semibold leading-snug tracking-tight">
          <BookOpenCheck className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <span>{rulebook.title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        <p className="text-sm text-muted-foreground">
          <span className="text-2xl font-semibold tabular-nums text-foreground">{rulebook.clauseCount}</span> clauses
        </p>
        {present.length > 0 ? (
          <div className="flex flex-wrap gap-x-3 gap-y-2">
            {present.map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <StatusBadge status={s} />
                <span className="text-sm font-medium tabular-nums text-muted-foreground">
                  {rulebook.statusCounts[s]}
                </span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Not compiled yet.</p>
        )}
      </CardContent>
      <CardFooter>
        <Button asChild className="w-full">
          <Link href={`/rulebooks/${rulebook.id}`}>
            Open rulebook <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
