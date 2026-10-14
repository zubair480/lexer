import type { Severity } from "@/shared/contract";
import { SEVERITY_META } from "@/lib/client/theme";
import { cn } from "@/lib/utils";

export function SeverityPill({ severity, className }: { severity: Severity; className?: string }) {
  const meta = SEVERITY_META[severity] ?? SEVERITY_META.warn;
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase leading-4 tracking-wider",
        meta.pill,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}

export default SeverityPill;
