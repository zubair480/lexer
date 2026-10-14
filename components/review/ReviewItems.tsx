"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { BookOpen, Check, FileText, Loader2, MessageSquarePlus, RefreshCw, RotateCcw } from "lucide-react";
import type { ReviewItem } from "@/shared/contract";
import { DEMO } from "@/shared/contract";
import { api } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { STATUS_META } from "@/lib/client/theme";
import { relativeTime } from "./time";

function ItemShell({
  accent,
  children,
  muted,
}: {
  accent: string;
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-l-4 bg-card px-4 py-3 transition-opacity",
        accent,
        muted && "opacity-60",
      )}
    >
      {children}
    </div>
  );
}

function ItemHead({ item, tag }: { item: ReviewItem; tag?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-foreground">{item.title}</p>
          {tag}
        </div>
        <p className="mt-1 font-serif text-sm leading-relaxed text-slate-600">{item.detail}</p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground" title={item.createdAt}>
        {relativeTime(item.createdAt)}
      </span>
    </div>
  );
}

/* ───────── Uncertain rule ───────── */

export function UncertainRuleItem({ item, onResolved }: { item: ReviewItem; onResolved?: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [resultStatus, setResultStatus] = React.useState<string | null>(null);

  async function recompile() {
    setBusy(true);
    try {
      const rule = await api.recompileRule(item.refId);
      setResultStatus(rule.status);
      const label = STATUS_META[rule.status]?.label ?? rule.status;
      if (rule.status === "verified" || rule.status === "active") {
        toast.success(`Recompiled — rule is now ${label.toLowerCase()}`);
        onResolved?.();
      } else {
        toast.message(`Recompiled — status: ${label}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Recompile failed");
    } finally {
      setBusy(false);
    }
  }

  const meta = resultStatus ? STATUS_META[resultStatus as keyof typeof STATUS_META] : STATUS_META.uncertain;

  return (
    <ItemShell accent="border-l-orange-500">
      <ItemHead
        item={item}
        tag={
          meta ? (
            <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", meta.badge)}>
              {meta.label}
            </span>
          ) : null
        }
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={recompile} disabled={busy}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          {busy ? "Recompiling…" : "Recompile"}
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href={`/rulebooks/${DEMO.rulebookId}`}>
            <BookOpen className="size-3.5" />
            Open rulebook
          </Link>
        </Button>
      </div>
    </ItemShell>
  );
}

/* ───────── Judgment clause ───────── */

export function JudgmentClauseItem({ item }: { item: ReviewItem }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [notes, setNotes] = React.useState<string[]>([]);
  const [acknowledged, setAcknowledged] = React.useState(false);

  function saveNote() {
    const text = draft.trim();
    if (!text) return;
    setNotes((n) => [...n, text]);
    setDraft("");
    setEditing(false);
    toast.success("Interpretation note saved", {
      description: "Recorded for reviewers. The clause remains human-judged — not auto-enforced.",
    });
  }

  return (
    <ItemShell accent="border-l-amber-500">
      <ItemHead
        item={item}
        tag={
          <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
            Not auto-enforced
          </span>
        }
      />

      {notes.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {notes.map((n, i) => (
            <li
              key={i}
              className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm text-slate-700"
            >
              <span className="mr-1.5 text-xs font-medium uppercase tracking-wider text-amber-800">
                Note ·
              </span>
              {n}
              <span className="ml-1.5 text-xs text-muted-foreground">— {DEMO.approver}</span>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <div className="mt-3 space-y-2">
          <Textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. Treat any matter with more than three associates in a week as 'excessive staffing' for review purposes."
            className="min-h-20 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveNote();
            }}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={saveNote} disabled={!draft.trim()}>
              Save note
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setDraft("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!editing && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <MessageSquarePlus className="size-3.5" />
            Add interpretation note
          </Button>
        )}
        {acknowledged ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
            <Check className="size-3.5" /> Acknowledged by {DEMO.approver}
          </span>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setAcknowledged(true);
              toast.success("Acknowledged", { description: `${item.title} stays with human reviewers.` });
            }}
          >
            <Check className="size-3.5" />
            Acknowledge
          </Button>
        )}
      </div>
    </ItemShell>
  );
}

/* ───────── Dismissed flag ───────── */

export function DismissedFlagItem({ item, onReopened }: { item: ReviewItem; onReopened?: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [reopened, setReopened] = React.useState(false);

  async function reopen() {
    setBusy(true);
    try {
      await api.updateFlag(item.refId, { status: "open" });
      setReopened(true);
      toast.success("Flag reopened", { description: "It's back on the invoice for review." });
      onReopened?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reopen flag");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ItemShell accent="border-l-slate-400" muted={reopened}>
      <ItemHead
        item={item}
        tag={
          <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
            {reopened ? "Reopened" : "Dismissed"}
          </span>
        }
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={reopen} disabled={busy || reopened}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
          {reopened ? "Reopened" : "Reopen"}
        </Button>
        <Button size="sm" variant="ghost" asChild>
          <Link href={`/invoices/${DEMO.invoiceId}`}>
            <FileText className="size-3.5" />
            Open invoice
          </Link>
        </Button>
      </div>
    </ItemShell>
  );
}
