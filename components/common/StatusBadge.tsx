import { Check } from "lucide-react";
import type { RuleStatus } from "@/shared/contract";
import { STATUS_META } from "@/lib/client/theme";
import { cn } from "@/lib/utils";

export function StatusBadge({
  status,
  attempt,
  className,
}: {
  status: RuleStatus;
  attempt?: number;
  className?: string;
}) {
  const meta = STATUS_META[status] ?? STATUS_META.pending;
  const label =
    status === "repairing" && attempt !== undefined && attempt > 0
      ? `${meta.label} · attempt ${attempt}`
      : meta.label;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium",
        meta.badge,
        className,
      )}
    >
      {status === "verified" ? (
        <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
      ) : (
        <span className="relative flex h-1.5 w-1.5" aria-hidden>
          {meta.pulse && (
            <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", meta.dot)} />
          )}
          <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", meta.dot, meta.pulse && "animate-pulse")} />
        </span>
      )}
      {label}
    </span>
  );
}

export default StatusBadge;
