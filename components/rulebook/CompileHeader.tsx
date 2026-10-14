"use client";

import { CheckCheck, Loader2, Play, RotateCw } from "lucide-react";
import type { RecordType, Rulebook } from "@/shared/contract";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const RECORD_TYPE_LABEL: Record<RecordType, string> = {
  time_entry: "Time entries",
  h1b_petition: "H-1B petitions",
};

export interface CompileHeaderProps {
  rulebook: Rulebook | null;
  compiledCount: number;
  total: number;
  isRunning: boolean;
  onCompile: () => void;
  onApproveAll: () => void;
  approvableCount: number;
  approving?: boolean;
}

export function CompileHeader({
  rulebook,
  compiledCount,
  total,
  isRunning,
  onCompile,
  onApproveAll,
  approvableCount,
  approving = false,
}: CompileHeaderProps) {
  const pct = total > 0 ? Math.round((compiledCount / total) * 100) : 0;
  const alreadyCompiled = compiledCount > 0;

  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0 space-y-1.5">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Rulebook compiler
          </div>
          <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
            {rulebook?.title ?? "Rulebook"}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {rulebook?.clientName && <span>{rulebook.clientName}</span>}
            {rulebook && (
              <Badge variant="outline" className="font-normal">
                {RECORD_TYPE_LABEL[rulebook.recordType] ?? rulebook.recordType}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={onApproveAll}
            disabled={approvableCount === 0 || approving || isRunning}
          >
            {approving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCheck className="mr-2 h-4 w-4" />
            )}
            Approve all verified ({approvableCount})
          </Button>
          <Button onClick={onCompile} disabled={isRunning || !rulebook}>
            {isRunning ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : alreadyCompiled ? (
              <RotateCw className="mr-2 h-4 w-4" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            {isRunning ? "Compiling…" : alreadyCompiled ? "Recompile" : "Compile"}
          </Button>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground">
              {compiledCount} of {total}
            </span>{" "}
            compiled
          </span>
          <span className="tabular-nums text-muted-foreground">{pct}%</span>
        </div>
        <Progress value={pct} className="h-2" />
      </div>
    </div>
  );
}

export default CompileHeader;
