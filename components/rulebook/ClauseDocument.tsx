"use client";

import * as React from "react";
import type { Clause, RuleStatus } from "@/shared/contract";
import { CLAUSE_TINT, STATUS_META } from "@/lib/client/theme";
import { cn } from "@/lib/utils";

export interface ClauseDocumentProps {
  sourceText: string;
  clauses: Clause[];
  statusByClause: Record<string, RuleStatus>;
  activeClauseId?: string | null;
  onClauseClick?: (clauseId: string) => void;
}

type Segment =
  | { kind: "text"; key: string; text: string }
  | { kind: "clause"; key: string; text: string; clause: Clause };

const LEGEND: RuleStatus[] = ["verified", "compiling", "needs_interpretation", "uncertain"];
const LEGEND_LABEL: Partial<Record<RuleStatus, string>> = { compiling: "In progress" };

function buildSegments(sourceText: string, clauses: Clause[]): Segment[] {
  const len = sourceText.length;
  const sorted = clauses
    .filter(
      (c) =>
        Number.isFinite(c.start) &&
        Number.isFinite(c.end) &&
        c.start >= 0 &&
        c.end > c.start &&
        c.start < len,
    )
    .slice()
    .sort((a, b) => a.start - b.start);

  const segments: Segment[] = [];
  let cursor = 0;
  for (const c of sorted) {
    if (c.start < cursor) continue; // overlap: skip safely
    const end = Math.min(c.end, len);
    if (c.start > cursor) {
      segments.push({ kind: "text", key: `t-${cursor}`, text: sourceText.slice(cursor, c.start) });
    }
    segments.push({ kind: "clause", key: `c-${c.id}`, text: sourceText.slice(c.start, end), clause: c });
    cursor = end;
  }
  if (cursor < len) {
    segments.push({ kind: "text", key: `t-${cursor}`, text: sourceText.slice(cursor) });
  }
  return segments;
}

function isHeadingLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (t.startsWith("#")) return true;
  const letters = t.replace(/[^A-Za-z]/g, "");
  return letters.length >= 3 && letters === letters.toUpperCase() && t.length <= 90;
}

/** Render plain (non-clause) text, emphasising heading lines. */
function PlainText({ text }: { text: string }) {
  const lines = text.split(/(\n)/);
  return (
    <>
      {lines.map((line, i) => {
        if (line === "\n") return <React.Fragment key={i}>{"\n"}</React.Fragment>;
        if (isHeadingLine(line)) {
          const shown = line.replace(/^(\s*)#+\s*/, "$1");
          return (
            <span key={i} className="font-semibold text-slate-900 tracking-tight">
              {shown}
            </span>
          );
        }
        return <React.Fragment key={i}>{line}</React.Fragment>;
      })}
    </>
  );
}

export function ClauseDocument({
  sourceText,
  clauses,
  statusByClause,
  activeClauseId,
  onClauseClick,
}: ClauseDocumentProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const segments = React.useMemo(() => buildSegments(sourceText ?? "", clauses ?? []), [sourceText, clauses]);

  React.useEffect(() => {
    if (!activeClauseId) return;
    const el =
      containerRef.current?.querySelector<HTMLElement>(`[id="clause-${CSS.escape(activeClauseId)}"]`) ??
      document.getElementById(`clause-${activeClauseId}`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeClauseId]);

  return (
    <div className="flex flex-col gap-3">
      <style>{`
        @keyframes clauseFadeIn {
          from { background-color: transparent; box-shadow: 0 0 0 0 rgba(30,42,74,0); }
          40% { box-shadow: 0 0 0 3px rgba(30,42,74,0.12); }
          to { box-shadow: 0 0 0 0 rgba(30,42,74,0); }
        }
        .clause-fade-in { animation: clauseFadeIn 700ms ease-out; }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Source guidelines</p>
        <div className="flex flex-wrap items-center gap-3">
          {LEGEND.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn("h-2 w-2 rounded-full", STATUS_META[s].dot)} />
              {LEGEND_LABEL[s] ?? STATUS_META[s].label}
            </span>
          ))}
        </div>
      </div>

      <div
        ref={containerRef}
        className="max-h-[calc(100vh-220px)] overflow-auto rounded-xl border bg-white p-8 shadow-sm"
      >
        {!sourceText ? (
          <p className="text-sm text-muted-foreground">No guideline text available.</p>
        ) : (
          <div className="whitespace-pre-wrap font-serif text-[15px] leading-7 text-slate-800">
            {segments.map((seg) => {
              if (seg.kind === "text") return <PlainText key={seg.key} text={seg.text} />;
              const id = seg.clause.id;
              const status: RuleStatus = statusByClause[id] ?? "pending";
              const active = activeClauseId === id;
              return (
                <mark
                  key={seg.key}
                  id={"clause-" + id}
                  role="button"
                  tabIndex={0}
                  title={`${seg.clause.number} ${seg.clause.title} — ${STATUS_META[status].label}`}
                  onClick={() => onClauseClick?.(id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onClauseClick?.(id);
                    }
                  }}
                  className={cn(
                    "clause-fade-in cursor-pointer rounded px-0.5 text-inherit underline decoration-2 underline-offset-4 transition-colors duration-500",
                    "hover:ring-1 hover:ring-[#1E2A4A]/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E2A4A]/40",
                    CLAUSE_TINT[status],
                    active && "ring-2 ring-[#1E2A4A]/40",
                  )}
                >
                  <sup className="mr-0.5 inline-flex select-none items-center gap-0.5 align-super font-sans text-[10px] font-medium text-slate-500 no-underline">
                    <span className={cn("inline-block h-1.5 w-1.5 rounded-full", STATUS_META[status].dot)} />
                    {seg.clause.number}
                  </sup>
                  {seg.text}
                </mark>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default ClauseDocument;
