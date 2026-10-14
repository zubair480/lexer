"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import type { Flag, Rulebook } from "@/shared/contract";
import { api } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { SeverityPill } from "@/components/common/SeverityPill";

/** Seeded record set the backend checks H-1B rulebooks against (lib/server/seed.ts USCIS_INVOICE_ID). */
const PETITIONS_ID = "inv_uscis_petitions";

/** Runs an H-1B rulebook's approved rules over the synthetic petitions and lists the flags. */
export function PetitionCheck({ rulebook }: { rulebook: Rulebook }) {
  const [flags, setFlags] = useState<Flag[] | null>(null);
  const [checking, setChecking] = useState(false);
  const ruleKey = rulebook.rules.map((r) => r.id).join("|");
  const ruleIds = useMemo(() => new Set(ruleKey.split("|").filter(Boolean)), [ruleKey]);
  const activeCount = rulebook.rules.filter((r) => r.status === "active").length;

  useEffect(() => {
    api
      .getInvoiceFlags(PETITIONS_ID)
      .then((fl) => {
        const own = fl.filter((f) => ruleIds.has(f.ruleId));
        setFlags(own.length ? own : null);
      })
      .catch(() => setFlags(null));
  }, [ruleIds]);

  const run = async () => {
    setChecking(true);
    try {
      const res = await api.checkInvoice(PETITIONS_ID, rulebook.id);
      setFlags(res.flags);
      const pets = new Set(res.flags.map((f) => f.entryId)).size;
      toast.success(res.flags.length ? `${res.flags.length} issues on ${pets} petition${pets === 1 ? "" : "s"}` : "All petitions pass");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Check failed");
    } finally {
      setChecking(false);
    }
  };

  const byPetition = useMemo(() => {
    const m = new Map<string, Flag[]>();
    for (const f of flags ?? []) m.set(f.entryId, [...(m.get(f.entryId) ?? []), f]);
    return [...m.entries()];
  }, [flags]);

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Check petitions</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Same engine, different records: run the approved rules over the synthetic H-1B petitions.
          </p>
        </div>
        <Button onClick={() => void run()} disabled={checking || activeCount === 0}>
          {checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {activeCount === 0 ? "Approve rules first" : flags ? "Re-run check" : "Check petitions"}
        </Button>
      </div>

      {flags && flags.length === 0 ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-emerald-700">
          <ShieldCheck className="h-4 w-4" /> Every petition passes the approved rules.
        </div>
      ) : null}

      {byPetition.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {byPetition.map(([petId, fl]) => (
            <li key={petId} className="rounded-lg border p-3">
              <div className="font-mono text-xs text-muted-foreground">{petId}</div>
              <ul className="mt-2 space-y-2">
                {fl.map((f) => (
                  <li key={f.id} className="flex items-start gap-3 text-sm">
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">§{f.clauseNumber}</span>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{f.ruleTitle}</span>
                      <span className="block text-muted-foreground">{f.message}</span>
                    </span>
                    <SeverityPill severity={f.severity} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default PetitionCheck;
