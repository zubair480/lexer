import type { RuleStatus, Severity } from "@/shared/contract";

/** Single source of truth for status / severity colors (F1). */

export interface StatusMeta {
  label: string;
  /** badge classes (bg + text + border) */
  badge: string;
  /** small solid dot color */
  dot: string;
  /** whether the status is "in progress" and should pulse */
  pulse: boolean;
}

export const STATUS_META: Record<RuleStatus, StatusMeta> = {
  pending: {
    label: "Pending",
    badge: "bg-white/[0.06] text-white/70 border-white/15",
    dot: "bg-slate-400",
    pulse: false,
  },
  compiling: {
    label: "Compiling",
    badge: "bg-sky-400/10 text-sky-300 border-sky-400/30",
    dot: "bg-blue-500",
    pulse: true,
  },
  testing: {
    label: "Testing",
    badge: "bg-sky-400/10 text-sky-300 border-sky-400/30",
    dot: "bg-blue-500",
    pulse: true,
  },
  repairing: {
    label: "Repairing",
    badge: "bg-violet-400/10 text-violet-300 border-violet-400/30",
    dot: "bg-violet-500",
    pulse: true,
  },
  verified: {
    label: "Verified",
    badge: "bg-[#34e27f]/10 text-[#5ef09c] border-[#34e27f]/35",
    dot: "bg-emerald-500",
    pulse: false,
  },
  uncertain: {
    label: "Uncertain",
    badge: "bg-orange-400/10 text-orange-300 border-orange-400/30",
    dot: "bg-orange-500",
    pulse: false,
  },
  needs_interpretation: {
    label: "Needs attorney",
    badge: "bg-amber-300/10 text-amber-200 border-amber-300/35",
    dot: "bg-amber-500",
    pulse: false,
  },
  active: {
    label: "Active",
    badge: "bg-[#34e27f]/20 text-[#7dffb4] border-[#34e27f]/50",
    dot: "bg-[#34e27f]",
    pulse: false,
  },
};

export interface SeverityMeta {
  label: string;
  pill: string;
  /** row tint for flagged table rows */
  row: string;
  /** left accent border for rows / cards */
  accent: string;
}

export const SEVERITY_META: Record<Severity, SeverityMeta> = {
  reject: {
    label: "Reject",
    pill: "bg-[#ff5a4e]/12 text-[#ff8a80] border-[#ff5a4e]/35",
    row: "bg-[#ff5a4e]/[0.07] hover:bg-[#ff5a4e]/[0.12]",
    accent: "border-l-red-500",
  },
  reduce: {
    label: "Reduce",
    pill: "bg-orange-400/10 text-orange-300 border-orange-400/30",
    row: "bg-orange-400/[0.07] hover:bg-orange-400/[0.12]",
    accent: "border-l-orange-500",
  },
  warn: {
    label: "Warn",
    pill: "bg-yellow-300/10 text-yellow-200 border-yellow-300/30",
    row: "bg-yellow-300/[0.06] hover:bg-yellow-300/[0.1]",
    accent: "border-l-yellow-500",
  },
};

/** Background tint + underline for clause highlights in the guideline document. */
export const CLAUSE_TINT: Record<RuleStatus, string> = {
  pending: "bg-white/[0.04] text-white/85 decoration-white/30",
  compiling: "bg-sky-400/10 text-white decoration-sky-400 animate-pulse",
  testing: "bg-sky-400/10 text-white decoration-sky-400 animate-pulse",
  repairing: "bg-violet-400/12 text-white decoration-violet-400 animate-pulse",
  verified: "bg-[#34e27f]/[0.08] text-white decoration-[#34e27f]",
  uncertain: "bg-orange-400/10 text-white decoration-orange-400",
  needs_interpretation: "bg-amber-300/10 text-white decoration-amber-300",
  active: "bg-[#34e27f]/[0.12] text-white decoration-[#34e27f]",
};

export const IN_PROGRESS: RuleStatus[] = ["compiling", "testing", "repairing"];
export const FINAL: RuleStatus[] = ["verified", "uncertain", "needs_interpretation", "active"];
