/**
 * Lexer frontend API client (F2).
 * Talks to the live backend; NEXT_PUBLIC_USE_MOCKS=1 switches to mocks (lib/client/live.ts).
 * Mock mode keeps in-memory session state and adds 250–600 ms latency.
 */
import {
  API,
  DEMO,
  type AuditEntry,
  type Clause,
  type CompiledRule,
  type CreateInvoiceReq,
  type CreateRulebookReq,
  type DashboardSummary,
  type EvalResult,
  type Flag,
  type Invoice,
  type InvoiceCheckResult,
  type InvoiceSummary,
  type ReviewItem,
  type RecordType,
  type Role,
  type Rulebook,
  type RulebookSummary,
  type TimeEntry,
  type UpdateFlagReq,
} from "@/shared/contract";
import { isLive, type ApiKey } from "./live";
import {
  MOCK_AUDIT,
  MOCK_EVAL,
  MOCK_FLAGS,
  MOCK_INVOICE,
  MOCK_REVIEW,
  MOCK_RULEBOOK,
  MOCK_USCIS_RULEBOOK,
  computeTotals,
  mockSuggestion,
  summarizeInvoice,
  summarizeRulebook,
} from "./mocks";

/* ───────────────────────────── HTTP ───────────────────────────── */

async function http<T>(url: string, method: "GET" | "POST" | "PATCH" = "GET", body?: unknown): Promise<T> {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const res = await fetch(url, {
    method,
    headers: body !== undefined && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    cache: "no-store",
  });
  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const msg =
      data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : res.statusText || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

/* ───────────────────────────── Mock store ───────────────────────────── */

interface MockState {
  rulebooks: Rulebook[];
  invoices: Invoice[];
  flags: Flag[]; // all flags across invoices
  checked: Set<string>; // invoice ids that have been checked
  audit: AuditEntry[];
}

function freshState(): MockState {
  return {
    rulebooks: [structuredClone(MOCK_RULEBOOK), structuredClone(MOCK_USCIS_RULEBOOK)],
    invoices: [structuredClone(MOCK_INVOICE)],
    flags: [],
    checked: new Set<string>(),
    audit: structuredClone(MOCK_AUDIT),
  };
}

let state: MockState = freshState();
let seq = 0;
const uid = (p: string): string => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}`;
const nowIso = (): string => new Date().toISOString();

function delay<T>(fn: () => T): Promise<T> {
  const ms = 250 + Math.floor(Math.random() * 350);
  return new Promise<T>((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(structuredClone(fn()));
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    }, ms);
  });
}

function audit(actor: string, action: string, targetType: string, targetId: string, note?: string): void {
  state.audit.unshift({ id: uid("aud"), actor, action, targetType, targetId, note, createdAt: nowIso() });
}

function findRulebook(id: string): Rulebook {
  const rb = state.rulebooks.find((x) => x.id === id);
  if (!rb) throw new Error(`Rulebook ${id} not found`);
  return rb;
}
function findInvoice(id: string): Invoice {
  const inv = state.invoices.find((x) => x.id === id);
  if (!inv) throw new Error(`Invoice ${id} not found`);
  return inv;
}
function findRule(ruleId: string): { rb: Rulebook; rule: CompiledRule } {
  for (const rb of state.rulebooks) {
    const rule = rb.rules.find((x) => x.id === ruleId);
    if (rule) return { rb, rule };
  }
  throw new Error(`Rule ${ruleId} not found`);
}
function findFlag(flagId: string): Flag {
  const f = state.flags.find((x) => x.id === flagId);
  if (!f) throw new Error(`Flag ${flagId} not found`);
  return f;
}
function refreshTotals(invoiceId: string): void {
  const inv = findInvoice(invoiceId);
  inv.totals = computeTotals(inv.entries, state.flags.filter((f) => f.invoiceId === invoiceId));
}

function approve(rule: CompiledRule, approvedBy: string): void {
  rule.status = "active";
  rule.approvedBy = approvedBy;
  rule.approvedAt = nowIso();
}

/** Parse "3.1 Title. Body" paragraphs out of free text (mock createRulebook). */
function parseClauses(rulebookId: string, sourceText: string): Clause[] {
  const out: Clause[] = [];
  const re = /^[ \t]*(?:§\s*)?(\d+(?:\.\d+)*)[.)]?[ \t]+([^.\n]{2,80})\.[ \t]*([^\n]*)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sourceText)) !== null) {
    const start = m.index + (m[0].length - m[0].trimStart().length);
    const end = m.index + m[0].trimEnd().length;
    out.push({
      id: `${rulebookId}_cl_${out.length + 1}`,
      rulebookId,
      number: m[1],
      title: m[2].trim(),
      text: sourceText.slice(start, end),
      start,
      end,
    });
  }
  if (out.length === 0 && sourceText.trim()) {
    const start = sourceText.length - sourceText.trimStart().length;
    const end = sourceText.trimEnd().length;
    out.push({ id: `${rulebookId}_cl_1`, rulebookId, number: "1", title: "Requirement", text: sourceText.slice(start, end), start, end });
  }
  return out;
}

/** Quote-aware CSV parser (mock createInvoice). */
function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (q) {
      if (ch === '"' && csv[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && csv[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

function csvToEntries(csv: string, invoiceId: string, matterId: string): TimeEntry[] {
  const rows = parseCsv(csv);
  if (rows.length < 2) throw new Error("CSV has no data rows");
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/[^a-z]/g, ""));
  const col = (row: string[], ...names: string[]): string => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i >= 0) return (row[i] ?? "").trim();
    }
    return "";
  };
  return rows.slice(1).map((row, i) => {
    const hours = Number(col(row, "hours", "units")) || 0;
    const rate = Number(col(row, "rate")) || 0;
    const amt = Number(col(row, "amount", "total"));
    const roleRaw = col(row, "role").toLowerCase();
    const role: Role = roleRaw === "partner" || roleRaw === "paralegal" ? roleRaw : "associate";
    const tkName = col(row, "timekeepername", "timekeeper", "name") || "Unknown";
    return {
      id: `${invoiceId}_te_${String(i + 1).padStart(2, "0")}`,
      invoiceId,
      date: col(row, "date"),
      timekeeperId: col(row, "timekeeperid") || `tk_${tkName.toLowerCase().replace(/[^a-z]+/g, "_")}`,
      timekeeperName: tkName,
      role,
      hours,
      rate,
      amount: Number.isFinite(amt) && amt > 0 ? amt : Math.round(hours * rate * 100) / 100,
      taskCode: col(row, "taskcode", "task"),
      activityCode: col(row, "activitycode", "activity"),
      narrative: col(row, "narrative", "description"),
      matterId: col(row, "matterid", "matter") || matterId,
    };
  });
}

/** Mock-only helpers used by useCompileStream. */
export function __mockGetRulebook(id: string): Rulebook | undefined {
  const rb = state.rulebooks.find((x) => x.id === id);
  return rb ? structuredClone(rb) : undefined;
}
export function __mockSaveRulebook(rb: Rulebook): void {
  const i = state.rulebooks.findIndex((x) => x.id === rb.id);
  const copy = structuredClone(rb);
  if (i >= 0) state.rulebooks[i] = copy;
  else state.rulebooks.push(copy);
  audit("Lexer compiler", "rulebook.compiled", "rulebook", rb.id, `${rb.rules.filter((x) => x.status === "verified").length} verified`);
}

/* ───────────────────────────── Mock implementations ───────────────────────────── */

const mock = {
  dashboard: (): Promise<DashboardSummary> =>
    delay(() => {
      const rb = state.rulebooks.find((x) => x.id === DEMO.rulebookId) ?? null;
      const inv = state.invoices.find((x) => x.id === DEMO.invoiceId) ?? state.invoices[0] ?? null;
      return {
        client: { id: DEMO.clientId, name: DEMO.clientName },
        rulebook: rb ? summarizeRulebook(rb) : null,
        latestInvoice: inv ? summarizeInvoice(inv) : null,
      };
    }),
  listRulebooks: (): Promise<RulebookSummary[]> => delay(() => state.rulebooks.map(summarizeRulebook)),
  createRulebook: (req: CreateRulebookReq): Promise<Rulebook> =>
    delay(() => {
      if (!req.sourceText.trim()) throw new Error("sourceText is required");
      const id = uid("rb");
      const rb: Rulebook = {
        id,
        clientId: DEMO.clientId,
        clientName: req.clientName || DEMO.clientName,
        title: req.title || "Untitled rulebook",
        recordType: req.recordType,
        sourceText: req.sourceText,
        clauses: parseClauses(id, req.sourceText),
        rules: [],
        createdAt: nowIso(),
      };
      state.rulebooks.push(rb);
      audit(DEMO.approver, "rulebook.uploaded", "rulebook", id, `${rb.title} (${rb.clauses.length} clauses)`);
      return rb;
    }),
  getRulebook: (id: string): Promise<Rulebook> => delay(() => findRulebook(id)),
  approveRule: (ruleId: string, approvedBy: string): Promise<CompiledRule> =>
    delay(() => {
      const { rule } = findRule(ruleId);
      if (rule.status !== "verified" && rule.status !== "active") {
        throw new Error(`Only verified rules can be approved (status: ${rule.status})`);
      }
      if (rule.status !== "active") {
        approve(rule, approvedBy);
        audit(approvedBy, "rule.approved", "rule", ruleId, rule.dsl?.title);
      }
      return rule;
    }),
  approveAll: (rulebookId: string, approvedBy: string): Promise<Rulebook> =>
    delay(() => {
      const rb = findRulebook(rulebookId);
      let n = 0;
      for (const rule of rb.rules) {
        if (rule.status === "verified") {
          approve(rule, approvedBy);
          n++;
        }
      }
      audit(approvedBy, "rule.approved", "rulebook", rulebookId, `Approved ${n} verified rules`);
      return rb;
    }),
  recompileRule: (ruleId: string): Promise<CompiledRule> =>
    delay(() => {
      const { rule } = findRule(ruleId);
      if (rule.dsl) {
        rule.status = "verified";
        rule.attempts = Math.min(3, rule.attempts + 1);
        delete rule.approvedBy;
        delete rule.approvedAt;
      }
      audit("Lexer compiler", "rule.recompiled", "rule", ruleId);
      return rule;
    }),
  listInvoices: (): Promise<InvoiceSummary[]> => delay(() => state.invoices.map(summarizeInvoice)),
  createInvoice: (req: CreateInvoiceReq): Promise<Invoice> =>
    delay(() => {
      const id = uid("inv");
      const entries = csvToEntries(req.csv, id, req.matterId);
      const inv: Invoice = {
        id,
        clientId: req.clientId,
        matterId: req.matterId,
        period: req.period,
        entries,
        totals: computeTotals(entries, []),
      };
      state.invoices.unshift(inv);
      audit(DEMO.approver, "invoice.uploaded", "invoice", id, `${entries.length} entries, matter ${req.matterId}`);
      return inv;
    }),
  getInvoice: (id: string): Promise<Invoice> => delay(() => findInvoice(id)),
  checkInvoice: (id: string, rulebookId: string): Promise<InvoiceCheckResult> =>
    delay(() => {
      const inv = findInvoice(id);
      findRulebook(rulebookId);
      if (!state.checked.has(id)) {
        if (id === DEMO.invoiceId) state.flags.push(...structuredClone(MOCK_FLAGS));
        state.checked.add(id);
      }
      refreshTotals(id);
      const flags = state.flags.filter((f) => f.invoiceId === id);
      audit(DEMO.approver, "invoice.checked", "invoice", id, `${flags.length} flags against ${rulebookId}`);
      return { invoiceId: id, rulebookId, flags, totals: inv.totals };
    }),
  getInvoiceFlags: (id: string): Promise<Flag[]> =>
    delay(() => {
      findInvoice(id);
      return state.flags.filter((f) => f.invoiceId === id);
    }),
  suggestFix: (flagId: string): Promise<Flag> =>
    delay(() => {
      const f = findFlag(flagId);
      const entry = state.invoices.flatMap((i) => i.entries).find((e) => e.id === f.entryId);
      f.suggestion = mockSuggestion(f, entry);
      audit("Lexer", "flag.suggested", "flag", flagId, f.suggestion.explanation);
      return f;
    }),
  updateFlag: (flagId: string, req: UpdateFlagReq): Promise<Flag> =>
    delay(() => {
      const f = findFlag(flagId);
      f.status = req.status;
      if (req.note !== undefined) f.note = req.note;
      refreshTotals(f.invoiceId);
      audit(DEMO.approver, `flag.${req.status === "open" ? "reopened" : req.status}`, "flag", flagId, req.note);
      return f;
    }),
  evalInvoice: (invoiceId: string): Promise<EvalResult> =>
    delay(() => {
      if (invoiceId !== DEMO.invoiceId) throw new Error(`No golden labels for invoice ${invoiceId}`);
      return MOCK_EVAL;
    }),
  review: (): Promise<ReviewItem[]> =>
    delay(() => {
      const items: ReviewItem[] = [];
      for (const rb of state.rulebooks) {
        for (const rule of rb.rules) {
          if (rule.status === "uncertain") {
            const cl = rb.clauses.find((x) => x.id === rule.clauseId);
            items.push({
              id: `rev_${rule.id}`,
              type: "uncertain_rule",
              title: `§${cl?.number ?? "?"} ${cl?.title ?? rule.id} failed verification`,
              detail: `Failed tests after ${rule.attempts} attempts; needs attorney review.`,
              refId: rule.id,
              createdAt: nowIso(),
            });
          }
        }
      }
      for (const f of state.flags.filter((x) => x.status === "dismissed")) {
        items.push({
          id: `rev_${f.id}`,
          type: "dismissed_flag",
          title: `Dismissed §${f.clauseNumber} flag on entry ${f.entryId}`,
          detail: f.note ? `${DEMO.approver} dismissed: "${f.note}"` : `${DEMO.approver} dismissed this flag without a note.`,
          refId: f.id,
          createdAt: nowIso(),
        });
      }
      return [...items, ...MOCK_REVIEW];
    }),
  audit: (): Promise<AuditEntry[]> => delay(() => state.audit),
  demoReset: (): Promise<{ ok: true }> =>
    delay(() => {
      state = freshState();
      return { ok: true as const };
    }),
};

/* ───────────────────────────── Public client ───────────────────────────── */

export interface UploadRulebookMeta {
  title?: string;
  clientName?: string;
  recordType?: RecordType;
}
export interface UploadInvoiceMeta {
  clientId?: string;
  matterId?: string;
  period?: string;
}

function toForm(file: File, meta: Record<string, string | undefined>): FormData {
  const fd = new FormData();
  fd.append("file", file, file.name);
  for (const [k, v] of Object.entries(meta)) if (v && v.trim()) fd.append(k, v.trim());
  return fd;
}

async function readText(file: File): Promise<string> {
  return file.text();
}

const use = (key: ApiKey): boolean => isLive(key);

export const api = {
  dashboard: (): Promise<DashboardSummary> =>
    use("dashboard") ? http(API.dashboard()) : mock.dashboard(),

  listRulebooks: (): Promise<RulebookSummary[]> =>
    use("rulebooks") ? http(API.rulebooks()) : mock.listRulebooks(),

  createRulebook: (req: CreateRulebookReq): Promise<Rulebook> =>
    use("rulebooks") ? http(API.rulebooks(), "POST", req) : mock.createRulebook(req),

  getRulebook: (id: string): Promise<Rulebook> =>
    use("rulebook") ? http(API.rulebook(id)) : mock.getRulebook(id),

  approveRule: (ruleId: string, approvedBy: string = DEMO.approver): Promise<CompiledRule> =>
    use("approveRule") ? http(API.approveRule(ruleId), "POST", { approvedBy }) : mock.approveRule(ruleId, approvedBy),

  approveAll: (rulebookId: string, approvedBy: string = DEMO.approver): Promise<Rulebook> =>
    use("approveAll") ? http(API.approveAll(rulebookId), "POST", { approvedBy }) : mock.approveAll(rulebookId, approvedBy),

  recompileRule: (ruleId: string): Promise<CompiledRule> =>
    use("recompileRule") ? http(API.recompileRule(ruleId), "POST", {}) : mock.recompileRule(ruleId),

  listInvoices: (): Promise<InvoiceSummary[]> =>
    use("invoices") ? http(API.invoices()) : mock.listInvoices(),

  createInvoice: (req: CreateInvoiceReq): Promise<Invoice> =>
    use("invoices") ? http(API.invoices(), "POST", req) : mock.createInvoice(req),

  /** Upload a guideline document (.md/.txt/.pdf/.docx/.html); the server extracts text and segments clauses. */
  uploadRulebook: async (file: File, meta: UploadRulebookMeta = {}): Promise<Rulebook> => {
    if (use("uploadRulebook")) return http(API.uploadRulebook(), "POST", toForm(file, { ...meta }));
    return mock.createRulebook({
      title: meta.title || file.name.replace(/\.[^.]+$/, ""),
      clientName: meta.clientName || DEMO.clientName,
      recordType: meta.recordType ?? "time_entry",
      sourceText: await readText(file),
    });
  },

  /** Upload an invoice file (CSV or LEDES 1998B, auto-detected server-side). */
  uploadInvoice: async (file: File, meta: UploadInvoiceMeta = {}): Promise<Invoice> => {
    if (use("uploadInvoice")) return http(API.uploadInvoice(), "POST", toForm(file, { ...meta }));
    return mock.createInvoice({
      clientId: meta.clientId || DEMO.clientId,
      matterId: meta.matterId || DEMO.matterId,
      period: meta.period || "2026-10",
      csv: await readText(file),
    });
  },

  getInvoice: (id: string): Promise<Invoice> =>
    use("invoice") ? http(API.invoice(id)) : mock.getInvoice(id),

  checkInvoice: (id: string, rulebookId: string = DEMO.rulebookId): Promise<InvoiceCheckResult> =>
    use("checkInvoice") ? http(API.checkInvoice(id), "POST", { rulebookId }) : mock.checkInvoice(id, rulebookId),

  getInvoiceFlags: (id: string): Promise<Flag[]> =>
    use("invoiceFlags") ? http(API.invoiceFlags(id)) : mock.getInvoiceFlags(id),

  suggestFix: (flagId: string): Promise<Flag> =>
    use("suggestFix") ? http(API.suggestFix(flagId), "POST", {}) : mock.suggestFix(flagId),

  updateFlag: (flagId: string, req: UpdateFlagReq): Promise<Flag> =>
    use("updateFlag") ? http(API.updateFlag(flagId), "PATCH", req) : mock.updateFlag(flagId, req),

  evalInvoice: (invoiceId: string): Promise<EvalResult> =>
    use("evalInvoice") ? http(API.evalInvoice(invoiceId)) : mock.evalInvoice(invoiceId),

  review: (): Promise<ReviewItem[]> =>
    use("review") ? http(API.review()) : mock.review(),

  audit: (): Promise<AuditEntry[]> =>
    use("audit") ? http(API.audit()) : mock.audit(),

  demoReset: (): Promise<{ ok: true }> =>
    use("demoReset") ? http(API.demoReset(), "POST", {}) : mock.demoReset(),
};

export type Api = typeof api;
