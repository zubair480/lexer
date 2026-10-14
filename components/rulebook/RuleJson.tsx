"use client";

import { useMemo, useState } from "react";
import { Check, ChevronRight, Copy } from "lucide-react";
import type { Rule } from "@/shared/contract";
import { cn } from "@/lib/utils";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Very light JSON syntax highlighting via regex spans. */
function highlight(json: string): string {
  return escapeHtml(json).replace(
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b|\b(true|false|null)\b/g,
    (m, str: string | undefined, colon: string | undefined, num: string | undefined, lit: string | undefined) => {
      if (str !== undefined) {
        if (colon) return `<span class="text-slate-500">${str}</span>${colon}`;
        return `<span class="text-emerald-700">${str}</span>`;
      }
      if (num !== undefined) return `<span class="text-blue-700">${num}</span>`;
      if (lit !== undefined) return `<span class="text-violet-700">${lit}</span>`;
      return m;
    },
  );
}

export function RuleJson({ rule, defaultOpen = true }: { rule: Rule; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);
  const json = useMemo(() => JSON.stringify(rule, null, 2), [rule]);
  const html = useMemo(() => highlight(json), [json]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="rounded-lg border bg-slate-50/70">
      <div className="flex items-center justify-between px-3 py-1.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
          Rule JSON
        </button>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Copy rule JSON"
        >
          {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {open && (
        <pre
          className="max-h-72 overflow-auto border-t px-3 py-2 font-mono text-xs leading-relaxed text-slate-800"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}

export default RuleJson;
