import { Loader2 } from "lucide-react";

export function LoadingState({ rows = 3, label = "Loading..." }: { rows?: number; label?: string }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{label}</span>
      </div>
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="h-4 animate-pulse rounded bg-slate-200/70"
            style={{ width: `${100 - ((i * 13) % 35)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export default LoadingState;
