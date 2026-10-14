"use client";

import { Building2, Briefcase, FlaskConical } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEMO } from "@/shared/contract";

export function ClientCard({ clientName, matterId }: { clientName: string; matterId?: string }) {
  return (
    <Card className="flex flex-col rounded-xl shadow-sm">
      <CardHeader className="pb-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Client</p>
        <CardTitle className="flex items-center gap-3 text-xl font-semibold tracking-tight">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Building2 className="h-5 w-5" />
          </span>
          {clientName}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 space-y-3 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Briefcase className="h-4 w-4" />
          <span>Matter</span>
          <span className="font-mono text-foreground">{matterId ?? DEMO.matterId}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <FlaskConical className="h-4 w-4" />
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600">
            Synthetic data
          </span>
        </div>
        <p className="pt-1 text-xs leading-relaxed text-muted-foreground">
          Outside counsel guidelines compiled into tested rules, applied to every invoice before it goes out.
        </p>
      </CardContent>
    </Card>
  );
}
