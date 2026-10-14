"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Loader2, Sparkles, Upload } from "lucide-react";

import type { RecordType } from "@/shared/contract";
import { DEMO } from "@/shared/contract";
import { api } from "@/lib/client/api";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ACME_OCG_SAMPLE, USCIS_H1B_SAMPLE, type RulebookSample } from "@/components/upload/samples";

const LABEL = "text-xs font-medium uppercase tracking-wider text-muted-foreground";

const RECORD_TYPES: { value: RecordType; label: string }[] = [
  { value: "time_entry", label: "Time entries (invoice)" },
  { value: "h1b_petition", label: "H-1B petition" },
];

export default function NewRulebookPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState<string>(DEMO.clientName);
  const [recordType, setRecordType] = useState<RecordType>("time_entry");
  const [sourceText, setSourceText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const errors = {
    title: title.trim() ? null : "Title is required.",
    clientName: clientName.trim() ? null : "Client name is required.",
    sourceText:
      sourceText.trim().length >= 40 ? null : "Paste the guideline text (at least a few sentences).",
  };
  const valid = !errors.title && !errors.clientName && !errors.sourceText;

  function loadSample(s: RulebookSample) {
    setTitle(s.title);
    setClientName(s.clientName);
    setRecordType(s.recordType);
    setSourceText(s.sourceText);
    setTouched(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      const rb = await api.createRulebook({
        title: title.trim(),
        clientName: clientName.trim(),
        recordType,
        sourceText,
      });
      toast.success("Rulebook created", { description: "Opening the compile view…" });
      router.push(`/rulebooks/${rb.id}`);
    } catch (err) {
      toast.error("Could not create rulebook", {
        description: err instanceof Error ? err.message : String(err),
      });
      setSubmitting(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || uploading) return;
    setUploading(f.name);
    try {
      const rb = await api.uploadRulebook(f, {
        title: title.trim() || undefined,
        clientName: clientName.trim() || undefined,
        recordType,
      });
      toast.success(`Read ${rb.clauses.length} clauses from ${f.name}`, { description: "Opening the compile view…" });
      router.push(`/rulebooks/${rb.id}`);
    } catch (err) {
      toast.error(`Could not read ${f.name}`, {
        description: err instanceof Error ? err.message : String(err),
      });
      setUploading(null);
    }
  }

  const wordCount = sourceText.trim() ? sourceText.trim().split(/\s+/).length : 0;

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-6">
      <PageHeader
        eyebrow="Rulebooks"
        title="New rulebook"
        subtitle="Upload a PDF, Word, Markdown or text file, or paste the guidelines. Lexer splits them into clauses and compiles each into a verified rule."
        actions={
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.md,.markdown,.txt,.html,.htm,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/html"
              className="hidden"
              onChange={onFile}
            />
            <Button type="button" onClick={() => fileRef.current?.click()} disabled={!!uploading || submitting}>
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {uploading ? `Reading ${uploading}…` : "Upload document"}
            </Button>
            <Button type="button" variant="outline" onClick={() => loadSample(ACME_OCG_SAMPLE)}>
              <Sparkles className="mr-2 h-4 w-4" />
              Load sample: Acme OCG
            </Button>
            <Button type="button" variant="outline" onClick={() => loadSample(USCIS_H1B_SAMPLE)}>
              <FileText className="mr-2 h-4 w-4" />
              Load sample: USCIS H-1B checklist
            </Button>
          </div>
        }
      />

      <form onSubmit={onSubmit} className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card className="h-fit rounded-xl shadow-sm">
          <CardContent className="space-y-5 pt-6">
            <div className="space-y-2">
              <label htmlFor="rb-title" className={LABEL}>
                Title
              </label>
              <Input
                id="rb-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Acme Corp Outside Counsel Guidelines"
                aria-invalid={touched && !!errors.title}
              />
              {touched && errors.title && <p className="text-xs text-red-600">{errors.title}</p>}
            </div>

            <div className="space-y-2">
              <label htmlFor="rb-client" className={LABEL}>
                Client name
              </label>
              <Input
                id="rb-client"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                aria-invalid={touched && !!errors.clientName}
              />
              {touched && errors.clientName && (
                <p className="text-xs text-red-600">{errors.clientName}</p>
              )}
            </div>

            <div className="space-y-2">
              <label className={LABEL}>Record type</label>
              <Select value={recordType} onValueChange={(v) => setRecordType(v as RecordType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECORD_TYPES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The kind of record these rules will be checked against.
              </p>
            </div>

            <div className="border-t pt-5">
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  "Create & compile"
                )}
              </Button>
              <p className="mt-3 text-xs text-muted-foreground">
                Synthetic data only — never upload real client information.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl shadow-sm">
          <CardContent className="space-y-2 pt-6">
            <div className="flex items-center justify-between">
              <label htmlFor="rb-text" className={LABEL}>
                Guideline text
              </label>
              <span className="text-xs text-muted-foreground">{wordCount} words</span>
            </div>
            <Textarea
              id="rb-text"
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder="Paste the outside counsel guidelines or checklist here…"
              className="min-h-[520px] resize-y font-serif text-[15px] leading-7"
              aria-invalid={touched && !!errors.sourceText}
            />
            {touched && errors.sourceText && (
              <p className="text-xs text-red-600">{errors.sourceText}</p>
            )}
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
