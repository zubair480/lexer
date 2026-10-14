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
    badge: "bg-slate-100 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
    pulse: false,
  },
  compiling: {
    label: "Compiling",
    badge: "bg-blue-50 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
    pulse: true,
  },
  testing: {
    label: "Testing",
    badge: "bg-blue-50 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
    pulse: true,
  },
  repairing: {
    label: "Repairing",
    badge: "bg-violet-50 text-violet-700 border-violet-200",
    dot: "bg-violet-500",
    pulse: true,
  },
  verified: {
    label: "Verified",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
    pulse: false,
  },
  uncertain: {
    label: "Uncertain",
    badge: "bg-orange-50 text-orange-700 border-orange-200",
    dot: "bg-orange-500",
    pulse: false,
  },
  needs_interpretation: {
    label: "Needs attorney",
    badge: "bg-amber-50 text-amber-800 border-amber-300",
    dot: "bg-amber-500",
    pulse: false,
  },
  active: {
    label: "Active",
    badge: "bg-[#1E2A4A] text-white border-[#1E2A4A]",
    dot: "bg-[#1E2A4A]",
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
    pill: "bg-red-50 text-red-700 border-red-200",
    row: "bg-red-50/60 hover:bg-red-50",
    accent: "border-l-red-500",
  },
  reduce: {
    label: "Reduce",
    pill: "bg-orange-50 text-orange-700 border-orange-200",
    row: "bg-orange-50/60 hover:bg-orange-50",
    accent: "border-l-orange-500",
  },
  warn: {
    label: "Warn",
    pill: "bg-yellow-50 text-yellow-800 border-yellow-200",
    row: "bg-yellow-50/60 hover:bg-yellow-50",
    accent: "border-l-yellow-500",
  },
};

/** Background tint + underline for clause highlights in the guideline document. */
export const CLAUSE_TINT: Record<RuleStatus, string> = {
  pending: "bg-slate-100/80 decoration-slate-300",
  compiling: "bg-blue-100/70 decoration-blue-400 animate-pulse",
  testing: "bg-blue-100/70 decoration-blue-400 animate-pulse",
  repairing: "bg-violet-100/80 decoration-violet-400 animate-pulse",
  verified: "bg-emerald-100/70 decoration-emerald-500",
  uncertain: "bg-orange-100/80 decoration-orange-500",
  needs_interpretation: "bg-amber-100/90 decoration-amber-500",
  active: "bg-indigo-100/70 decoration-[#1E2A4A]",
};

export const IN_PROGRESS: RuleStatus[] = ["compiling", "testing", "repairing"];
export const FINAL: RuleStatus[] = ["verified", "uncertain", "needs_interpretation", "active"];
