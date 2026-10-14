"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type ReviewTone = "orange" | "amber" | "slate";

const TONE: Record<ReviewTone, { badge: string; icon: string; bar: string }> = {
  orange: {
    badge: "bg-orange-50 text-orange-700 border-orange-200",
    icon: "bg-orange-50 text-orange-600",
    bar: "bg-orange-500",
  },
  amber: {
    badge: "bg-amber-50 text-amber-800 border-amber-300",
    icon: "bg-amber-50 text-amber-700",
    bar: "bg-amber-500",
  },
  slate: {
    badge: "bg-slate-100 text-slate-600 border-slate-200",
    icon: "bg-slate-100 text-slate-600",
    bar: "bg-slate-400",
  },
};

export function toneAccent(tone: ReviewTone): string {
  return tone === "orange"
    ? "border-l-orange-500"
    : tone === "amber"
      ? "border-l-amber-500"
      : "border-l-slate-400";
}

export function ReviewSection({
  title,
  description,
  count,
  tone,
  icon,
  emptyText,
  children,
}: {
  title: string;
  description: string;
  count: number;
  tone: ReviewTone;
  icon: React.ReactNode;
  emptyText: string;
  children?: React.ReactNode;
}) {
  const t = TONE[tone];
  return (
    <Card className="relative overflow-hidden rounded-xl shadow-sm">
      <div className={cn("absolute inset-x-0 top-0 h-1", t.bar)} />
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", t.icon)}>
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">{title}</h2>
              <span
                className={cn(
                  "inline-flex min-w-6 items-center justify-center rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums",
                  t.badge,
                )}
              >
                {count}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {count === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-emerald-600" />
            {emptyText}
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
