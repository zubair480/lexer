"use client";

import { AlertTriangle, RotateCw } from "lucide-react";

export function ErrorState({ error, onRetry }: { error: Error | string; onRetry?: () => void }) {
  const message = typeof error === "string" ? error : error?.message || "Unknown error";
  return (
    <div className="rounded-xl border border-red-200 bg-red-50/50 p-6" role="alert">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-red-900">Something went wrong</p>
          <p className="mt-1 break-words text-sm text-red-700">{message}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 shadow-sm transition-colors hover:bg-red-50"
            >
              <RotateCw className="h-3.5 w-3.5" />
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ErrorState;
