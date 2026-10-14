"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileSpreadsheet, Loader2, ShieldAlert, Upload } from "lucide-react";

import { DEMO } from "@/shared/contract";
import { api } from "@/lib/client/api";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { missingHeaders, parseCsvObjects } from "@/components/upload/csv";
import { SAMPLE_INVOICE_CSV } from "@/components/upload/samples";

const LABEL = "text-xs font-medium uppercase tracking-wider text-muted-foreground";
const PREVIEW_COLS = ["date", "timekeeperName", "role", "hours", "rate", "taskCode", "narrative"];

export default function NewInvoicePage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [matterId, setMatterId] = useState<string>(DEMO.matterId);
  const [period, setPeriod] = useState("2026-10");
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);

  const parsed = useMemo(() => parseCsvObjects(csv), [csv]);
  const missing = csv.trim() ? missingHeaders(parsed.headers) : [];

  const errors = {
    matterId: matterId.trim() ? null : "Matter ID is required.",
    period: /^\d{4}-\d{2}$/.test(period.trim()) ? null : "Use YYYY-MM.",
    csv: !csv.trim()
      ? "Paste or upload a CSV."
      : missing.length
        ? `Missing columns: ${missing.join(", ")}`
        : parsed.rows.length === 0
          ? "CSV has no data rows."
          : null,
  };
  const valid = !errors.matterId && !errors.period && !errors.csv;

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCsv(typeof reader.result === "string" ? reader.result : "");
      setFileName(f.name);
    };
    reader.onerror = () => toast.error("Could not read file");
    reader.readAsText(f);
    e.target.value = "";
  }

  function loadSample() {
    setCsv(SAMPLE_INVOICE_CSV);
    setFileName("invoice-oct.csv (sample)");
    setMatterId(DEMO.matterId);
    setPeriod("2026-10");
    setTouched(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      const inv = await api.createInvoice({
        clientId: DEMO.clientId,
        matterId: matterId.trim(),
        period: period.trim(),
        csv,
      });
      toast.success("Invoice uploaded", { description: "Opening the check view…" });
      router.push(`/invoices/${inv.id}`);
    } catch (err) {
      toast.error("Could not upload invoice", {
        description: err instanceof Error ? err.message : String(err),
      });
      setSubmitting(false);
    }
  }

  const preview = parsed.rows.slice(0, 5);

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-6">
      <PageHeader
        eyebrow="Invoices"
        title="Upload invoice"
        subtitle="Paste or upload a LEDES-style CSV of time entries to check against an approved rulebook."
        actions={
          <Button type="button" variant="outline" onClick={loadSample}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Load sample CSV
          </Button>
        }
      />

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        Synthetic data only — never upload real client information.
      </div>

      <form onSubmit={onSubmit} className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card className="h-fit rounded-xl shadow-sm">
          <CardContent className="space-y-5 pt-6">
            <div className="space-y-2">
              <label className={LABEL}>Client</label>
              <p className="text-sm font-medium">{DEMO.clientName}</p>
            </div>
            <div className="space-y-2">
              <label htmlFor="inv-matter" className={LABEL}>
                Matter ID
              </label>
              <Input
                id="inv-matter"
                value={matterId}
                onChange={(e) => setMatterId(e.target.value)}
                className="font-mono"
                aria-invalid={touched && !!errors.matterId}
              />
              {touched && errors.matterId && (
                <p className="text-xs text-red-600">{errors.matterId}</p>
              )}
            </div>
            <div className="space-y-2">
              <label htmlFor="inv-period" className={LABEL}>
                Billing period
              </label>
              <Input
                id="inv-period"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                placeholder="YYYY-MM"
                className="font-mono"
                aria-invalid={touched && !!errors.period}
              />
              {touched && errors.period && <p className="text-xs text-red-600">{errors.period}</p>}
            </div>
            <div className="border-t pt-5">
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading…
                  </>
                ) : (
                  "Create invoice"
                )}
              </Button>
              {parsed.rows.length > 0 && !missing.length && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {parsed.rows.length} entries ready to import.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-xl shadow-sm">
            <CardContent className="space-y-2 pt-6">
              <div className="flex items-center justify-between">
                <label htmlFor="inv-csv" className={LABEL}>
                  CSV
                </label>
                <div className="flex items-center gap-3">
                  {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,text/csv,text/plain"
                    className="hidden"
                    onChange={onFile}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Choose file
                  </Button>
                </div>
              </div>
              <Textarea
                id="inv-csv"
                value={csv}
                onChange={(e) => {
                  setCsv(e.target.value);
                  setFileName(null);
                }}
                placeholder="date,timekeeperId,timekeeperName,role,hours,rate,taskCode,activityCode,narrative"
                className="min-h-[220px] resize-y font-mono text-xs leading-5"
                aria-invalid={touched && !!errors.csv}
              />
              {(touched || missing.length > 0) && errors.csv && (
                <p className="text-xs text-red-600">{errors.csv}</p>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-xl shadow-sm">
            <CardContent className="pt-6">
              <div className="mb-3 flex items-center justify-between">
                <span className={LABEL}>Preview</span>
                {parsed.rows.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    Showing {preview.length} of {parsed.rows.length} rows
                  </span>
                )}
              </div>
              {preview.length === 0 ? (
                <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                  Parsed rows will appear here.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      {PREVIEW_COLS.map((c) => (
                        <TableHead key={c} className={c === "hours" || c === "rate" ? "text-right" : ""}>
                          {c}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((r, i) => (
                      <TableRow key={i}>
                        {PREVIEW_COLS.map((c) => (
                          <TableCell
                            key={c}
                            className={
                              c === "narrative"
                                ? "max-w-[360px] truncate"
                                : c === "hours" || c === "rate"
                                  ? "text-right tabular-nums"
                                  : "whitespace-nowrap"
                            }
                            title={c === "narrative" ? r[c] : undefined}
                          >
                            {r[c] ?? ""}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  );
}
