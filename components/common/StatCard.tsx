import type React from "react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "default" | "danger" | "success";
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        {icon && <div className="text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">{icon}</div>}
      </div>
      <div
        className={cn(
          "mt-2 text-3xl font-semibold tracking-tight tabular-nums",
          tone === "danger" && "text-red-600",
          tone === "success" && "text-emerald-600",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-1.5 text-sm text-muted-foreground">{hint}</div>}
    </div>
  );
}

export default StatCard;
