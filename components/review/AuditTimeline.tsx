"use client";

import * as React from "react";
import {
  BadgeCheck,
  Ban,
  BookOpen,
  CheckCircle2,
  Circle,
  FileSearch,
  FileUp,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import type { AuditEntry } from "@/shared/contract";
import { cn } from "@/lib/utils";
import { absoluteTime, relativeTime } from "./time";

const ACTION_META: Record<string, { label: string; icon: LucideIcon; tone: string }> = {
  "rule.approved": { label: "approved rule", icon: BadgeCheck, tone: "bg-[#1E2A4A] text-white" },
  "rule.approved_all": { label: "approved all verified rules", icon: BadgeCheck, tone: "bg-[#1E2A4A] text-white" },
  "rule.recompiled": { label: "recompiled rule", icon: RefreshCw, tone: "bg-blue-50 text-blue-700" },
  "rule.verified": { label: "verified rule", icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-700" },
  "rule.uncertain": { label: "marked rule uncertain", icon: Circle, tone: "bg-orange-50 text-orange-700" },
  "rulebook.created": { label: "created rulebook", icon: FileUp, tone: "bg-slate-100 text-slate-700" },
  "rulebook.compiled": { label: "compiled rulebook", icon: BookOpen, tone: "bg-blue-50 text-blue-700" },
  "invoice.created": { label: "uploaded invoice", icon: FileUp, tone: "bg-slate-100 text-slate-700" },
  "invoice.checked": { label: "checked invoice", icon: FileSearch, tone: "bg-blue-50 text-blue-700" },
  "flag.dismissed": { label: "dismissed flag", icon: Ban, tone: "bg-slate-100 text-slate-600" },
  "flag.accepted": { label: "accepted flag", icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-700" },
  "flag.reopened": { label: "reopened flag", icon: RotateCcw, tone: "bg-amber-50 text-amber-800" },
  "flag.opened": { label: "reopened flag", icon: RotateCcw, tone: "bg-amber-50 text-amber-800" },
  "flag.suggested": { label: "suggested fix for flag", icon: Wand2, tone: "bg-violet-50 text-violet-700" },
  "suggestion.created": { label: "suggested fix", icon: Wand2, tone: "bg-violet-50 text-violet-700" },
  "demo.reset": { label: "reset demo", icon: Sparkles, tone: "bg-slate-100 text-slate-600" },
};

/** "rule.approved" → "approved rule"; unknown → best-effort humanization. */
export function humanizeAction(action: string): string {
  const known = ACTION_META[action];
  if (known) return known.label;
  const [target, verb] = action.split(".");
  if (!verb) return action.replace(/[_.]/g, " ");
  return `${verb.replace(/_/g, " ")} ${target.replace(/_/g, " ")}`;
}

function metaFor(action: string) {
  return (
    ACTION_META[action] ?? {
      label: humanizeAction(action),
      icon: Circle,
      tone: "bg-slate-100 text-slate-600",
    }
  );
}

export function AuditTimeline({ entries }: { entries: AuditEntry[] }) {
  const sorted = React.useMemo(
    () => [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [entries],
  );

  if (sorted.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/40 px-4 py-8 text-center text-sm text-muted-foreground">
        No activity recorded yet.
      </div>
    );
  }

  return (
    <ol className="relative">
      <div className="absolute bottom-3 left-[15px] top-3 w-px bg-border" aria-hidden />
      {sorted.map((e) => {
        const m = metaFor(e.action);
        const Icon = m.icon;
        return (
          <li key={e.id} className="relative flex gap-4 pb-5 last:pb-0">
            <div
              className={cn(
                "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-card",
                m.tone,
              )}
            >
              <Icon className="size-4" />
            </div>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                <p className="text-sm text-foreground">
                  <span className="font-medium">{e.actor}</span>{" "}
                  <span className="text-muted-foreground">{humanizeAction(e.action)}</span>{" "}
                  <span className="font-mono text-xs text-slate-700">{e.targetId}</span>
                </p>
                <time
                  dateTime={e.createdAt}
                  title={absoluteTime(e.createdAt)}
                  className="shrink-0 text-xs text-muted-foreground"
                >
                  {relativeTime(e.createdAt)}
                </time>
              </div>
              {e.note && (
                <p className="mt-1 rounded-md bg-muted/60 px-3 py-1.5 font-serif text-sm italic text-slate-600">
                  “{e.note}”
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
