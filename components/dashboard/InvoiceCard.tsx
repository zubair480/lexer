"use client";

import Link from "next/link";
import { FileText, ArrowRight } from "lucide-react";
import type { InvoiceSummary } from "@/shared/contract";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/common/Money";

export function InvoiceCard({ invoice }: { invoice: InvoiceSummary }) {
  const { totals } = invoice;
  return (
    <Card className="flex flex-col rounded-xl shadow-sm">
      <CardHeader className="pb-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Latest invoice</p>
        <CardTitle className="flex items-center gap-3 text-lg font-semibold tracking-tight">
          <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
          <span className="font-mono text-base">{invoice.matterId}</span>
          <span className="text-sm font-normal text-muted-foreground">· {invoice.period}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 space-y-2">
        <p className="text-sm text-muted-foreground">
          {totals.entryCount} entries · {totals.flaggedCount} {totals.flaggedCount === 1 ? "flag" : "flags"}
        </p>
        <div>
          <Money
            value={totals.atRisk}
            className="block text-5xl font-semibold tracking-tight tabular-nums text-red-600"
          />
          <p className="mt-1 text-sm text-muted-foreground">
            at risk of <Money value={totals.billed} className="font-medium text-foreground" /> billed
          </p>
        </div>
      </CardContent>
      <CardFooter>
        <Button asChild className="w-full">
          <Link href={`/invoices/${invoice.id}`}>
            Check invoice <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
