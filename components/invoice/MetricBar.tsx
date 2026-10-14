"use client";

import { cn } from "@/lib/utils";

/** Color for a 0..1 metric: >=0.9 emerald, >=0.7 amber, else red. */
export function metricTone(value: number): { bar: string; text: string } {
  if (value >= 0.9) return { bar: "bg-emerald-500", text: "text-emerald-700" };
  if (value >= 0.7) return { bar: "bg-amber-500", text: "text-amber-700" };
  return { bar: "bg-red-500", text: "text-red-700" };
}

export function MetricBar({
  value,
  label,
  className,
}: {
  value: number; // 0..1
  label?: string;
  className?: string;
}) {
  const v = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  const pct = Math.round(v * 100);
  const tone = metricTone(v);
  return (
    <div className={cn("flex min-w-[140px] items-center gap-3", className)}>
      <div
        className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-700 ease-out", tone.bar)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn("w-10 text-right text-xs font-medium tabular-nums", tone.text)}>
        {pct}%
      </span>
    </div>
  );
}

export default MetricBar;
