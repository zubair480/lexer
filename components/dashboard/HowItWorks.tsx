"use client";

import { Fragment } from "react";
import { ArrowRight, FileCode2, ShieldCheck, SearchCheck } from "lucide-react";

const STEPS = [
  {
    n: 1,
    title: "Compile",
    body: "Guidelines become tested rules. Each clause compiles to a rule that must pass its own tests.",
    Icon: FileCode2,
  },
  {
    n: 2,
    title: "Approve",
    body: "An attorney signs off on every rule. Judgment calls are never automated.",
    Icon: ShieldCheck,
  },
  {
    n: 3,
    title: "Check",
    body: "Invoices are checked before they go out. Every flag cites its clause.",
    Icon: SearchCheck,
  },
];

export function HowItWorks() {
  return (
    <section className="rounded-xl border bg-card p-6 shadow-sm">
      <p className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">How it works</p>
      <div className="flex flex-col items-stretch gap-4 md:flex-row md:items-center">
        {STEPS.map(({ n, title, body, Icon }, i) => (
          <Fragment key={n}>
            <div className="flex flex-1 items-start gap-4 rounded-lg bg-muted/50 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold">
                  <span className="mr-1.5 text-muted-foreground">{n}</span>
                  {title}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <ArrowRight className="hidden h-5 w-5 shrink-0 text-muted-foreground/60 md:block" aria-hidden />
            )}
          </Fragment>
        ))}
      </div>
    </section>
  );
}
