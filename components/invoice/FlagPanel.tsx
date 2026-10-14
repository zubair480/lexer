"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Sparkles, Check, X, ArrowUpRight, Loader2, Scale } from "lucide-react";
import type { Clause, Flag, TimeEntry } from "@/shared/contract";
import { api } from "@/lib/client/api";
import { SEVERITY_META } from "@/lib/client/theme";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { SuggestionBox } from "./SuggestionBox";

export interface FlagPanelProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  entry: TimeEntry | null;
  flags: Flag[];
  clauses: Clause[];
  onFlagUpdated: (flag: Flag) => void;
}

function fmtMoney(v: number, decimals: 0 | 2 = 0) {
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

const STOP = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "than", "more", "must", "shall", "will",
  "entry", "entries", "time", "billed", "billing", "hours", "rule", "each", "which", "were", "been", "have",
  "not", "are", "may", "any", "all", "per", "its", "over",
]);

function keywords(flag: Flag): string[] {
  const words = `${flag.ruleTitle} ${flag.message}`.toLowerCase().match(/[a-z][a-z-]{2,}/g) ?? [];
  return Array.from(new Set(words.filter((w) => !STOP.has(w))));
}

/** Split clause text into [before, highlight, after] around the most relevant sentence. */
function splitForHighlight(text: string, flag: Flag): [string, string, string] {
  const sentences = text.match(/[^.!?;]+[.!?;]*\s*/g) ?? [text];
  const kws = keywords(flag);
  let best = 0;
  let bestScore = 0;
  sentences.forEach((s, i) => {
    const lower = s.toLowerCase();
    const score = kws.reduce((n, k) => n + (lower.includes(k) ? (k === flag.ruleTitle.toLowerCase() ? 3 : 1) : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  const before = sentences.slice(0, best).join("");
  const hit = sentences[best] ?? "";
  const after = sentences.slice(best + 1).join("");
  const trimmed = hit.trimEnd();
  return [before, trimmed, hit.slice(trimmed.length) + after];
}

function FlagCard({
  flag,
  clause,
  entry,
  onFlagUpdated,
}: {
  flag: Flag;
  clause: Clause | undefined;
  entry: TimeEntry;
  onFlagUpdated: (flag: Flag) => void;
}) {
  const [suggesting, setSuggesting] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [note, setNote] = useState("");
  const sev = SEVERITY_META[flag.severity];
  const hasSuggestion = !!flag.suggestion;
  const isOpen = flag.status === "open";

  async function suggest() {
    setSuggesting(true);
    try {
      const updated = await api.suggestFix(flag.id);
      onFlagUpdated(updated);
      toast.success(updated.suggestion?.verified ? "Suggested fix verified against all active rules" : "Suggestion ready — review manually");
    } catch (e) {
      toast.error(`Couldn't generate a suggestion: ${(e as Error).message}`);
    } finally {
      setSuggesting(false);
    }
  }

  async function accept() {
    setUpdating(true);
    try {
      const updated = await api.updateFlag(flag.id, { status: "accepted" });
      onFlagUpdated(updated);
      toast.success(hasSuggestion ? "Fix accepted" : "Flag accepted");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUpdating(false);
    }
  }

  async function dismiss() {
    if (!note.trim()) {
      toast.error("A note is required to dismiss a flag");
      return;
    }
    setUpdating(true);
    try {
      const updated = await api.updateFlag(flag.id, { status: "dismissed", note: note.trim() });
      onFlagUpdated(updated);
      setDismissing(false);
      setNote("");
      toast.success("Flag dismissed with note");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUpdating(false);
    }
  }

  const clauseText = clause?.text ?? "";
  const [pre, hit, post] = clauseText ? splitForHighlight(clauseText, flag) : ["", "", ""];
  const acceptDisabled = updating;

  return (
    <div className={cn("rounded-xl border border-l-4 bg-card p-5 shadow-sm", sev.accent)}>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold", sev.pill)}>
          {sev.label}
        </span>
        <h3 className="text-base font-semibold text-foreground">{flag.ruleTitle}</h3>
        <span className="font-mono text-xs text-muted-foreground">§{flag.clauseNumber}</span>
        {flag.status !== "open" && (
          <span
            className={cn(
              "ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
              flag.status === "accepted"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-slate-100 text-slate-600",
            )}
          >
            {flag.status === "accepted" ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
            {flag.status === "accepted" ? "Accepted" : "Dismissed"}
          </span>
        )}
      </div>

      {/* Clause */}
      <div className="mt-4">
        <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Guideline clause {clause ? `§${clause.number} · ${clause.title}` : `§${flag.clauseNumber}`}
        </div>
        {clauseText ? (
          <blockquote className="border-l-2 border-slate-300 pl-4 font-serif text-[15px] leading-relaxed text-slate-700">
            {pre}
            <mark className="rounded-sm bg-amber-100 px-0.5 text-slate-900">{hit}</mark>
            {post}
          </blockquote>
        ) : (
          <p className="text-sm italic text-muted-foreground">Clause text unavailable.</p>
        )}
      </div>

      {/* Explanation */}
      <div className="mt-4">
        <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Why it was flagged</div>
        <p className="text-sm text-foreground/90">{flag.message}</p>
      </div>

      {/* Impact */}
      <div className="mt-4 flex items-baseline gap-2">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Impact</div>
        {flag.impactUsd > 0 ? (
          <>
            <span className="text-2xl font-semibold tabular-nums text-red-600">{fmtMoney(flag.impactUsd)}</span>
            <span className="text-sm text-red-600/80">at risk</span>
          </>
        ) : (
          <span className="text-lg font-semibold text-muted-foreground">$0 · warning only</span>
        )}
      </div>

      {/* Suggestion */}
      {(suggesting || hasSuggestion) && (
        <div className="mt-4">
          <SuggestionBox
            flag={flag}
            onFlagUpdated={onFlagUpdated}
            loading={suggesting}
            originalNarrative={entry.narrative}
          />
        </div>
      )}

      {/* Dismiss note (existing) */}
      {flag.status === "dismissed" && flag.note && (
        <div className="mt-4 rounded-lg bg-muted/60 px-3 py-2 text-sm">
          <span className="font-medium">Note: </span>
          {flag.note}
        </div>
      )}

      {/* Actions */}
      {isOpen && (
        <div className="mt-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {!hasSuggestion && (
              <Button variant="outline" size="sm" onClick={suggest} disabled={suggesting || updating}>
                {suggesting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
                Suggest fix
              </Button>
            )}
            <Button size="sm" onClick={accept} disabled={acceptDisabled || suggesting}>
              {updating && !dismissing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
              {hasSuggestion ? "Accept fix" : "Accept flag"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDismissing((d) => !d)} disabled={updating}>
              <X className="mr-1.5 h-4 w-4" /> Dismiss
            </Button>
            <Link
              href="/review"
              className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Send to review <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {dismissing && (
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why is this flag being dismissed? (required)"
                rows={3}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setDismissing(false)} disabled={updating}>
                  Cancel
                </Button>
                <Button size="sm" variant="secondary" onClick={dismiss} disabled={updating || !note.trim()}>
                  {updating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                  Confirm dismiss
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function FlagPanel({ open, onOpenChange, entry, flags, clauses, onFlagUpdated }: FlagPanelProps) {
  const findClause = (f: Flag) =>
    clauses.find((c) => c.id === f.clauseId) ?? clauses.find((c) => c.number === f.clauseNumber);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b px-6 py-5 text-left">
          <SheetTitle className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-muted-foreground" />
            {flags.length === 1 ? "1 flag on this entry" : `${flags.length} flags on this entry`}
          </SheetTitle>
          <SheetDescription>
            {entry ? `${entry.date} · ${entry.timekeeperName} (${entry.role})` : "No entry selected"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {entry && (
            <div className="mb-6 space-y-3">
              <div className="flex items-baseline justify-between gap-4">
                <div className="text-sm text-muted-foreground tabular-nums">
                  {entry.hours.toFixed(1)} h × {fmtMoney(entry.rate)}/h
                  <span className="ml-2 font-mono text-xs">
                    {entry.taskCode} · {entry.activityCode}
                  </span>
                </div>
                <div className="text-xl font-semibold tabular-nums">{fmtMoney(entry.amount, 2)}</div>
              </div>
              <div className="rounded-lg bg-muted/60 px-4 py-3 text-sm italic text-muted-foreground">
                “{entry.narrative}”
              </div>
            </div>
          )}

          <div className="space-y-4">
            {entry &&
              flags.map((f) => (
                <FlagCard key={f.id} flag={f} clause={findClause(f)} entry={entry} onFlagUpdated={onFlagUpdated} />
              ))}
            {entry && flags.length === 0 && (
              <p className="text-sm text-muted-foreground">No flags on this entry.</p>
            )}
          </div>
        </div>

        <div className="border-t px-6 py-3 text-xs text-muted-foreground">
          Flags are produced by deterministic rules. AI only suggests fixes.
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default FlagPanel;
