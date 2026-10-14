// B10 — invoice CSV parsing.
// @ts-ignore -- @types/papaparse may not be installed; we type the bits we use below.
import PapaRaw from "papaparse";
import type { Role, TimeEntry } from "@/shared/contract";

type ParseResult = { data: Record<string, unknown>[]; errors: { message: string; row?: number }[]; meta: { fields?: string[] } };
const Papa = PapaRaw as unknown as {
  parse(input: string, config: Record<string, unknown>): ParseResult;
};

/** normalized header -> TimeEntry field */
const ALIASES: Record<string, keyof TimeEntry> = {
  id: "id", entryid: "id", lineitemnumber: "id", lineid: "id",
  date: "date", lineitemdate: "date", entrydate: "date",
  timekeeperid: "timekeeperId", tkid: "timekeeperId",
  timekeepername: "timekeeperName", timekeeper: "timekeeperName", name: "timekeeperName",
  role: "role", timekeeperrole: "role", classification: "role", timekeeperclassification: "role",
  hours: "hours", units: "hours", lineitemnumberofunits: "hours",
  rate: "rate", unitcost: "rate", lineitemunitcost: "rate",
  amount: "amount", total: "amount", lineitemtotal: "amount",
  taskcode: "taskCode", lineitemtaskcode: "taskCode", task: "taskCode",
  activitycode: "activityCode", lineitemactivitycode: "activityCode", activity: "activityCode",
  narrative: "narrative", description: "narrative", lineitemdescription: "narrative",
  matterid: "matterId", matter: "matterId", clientmatterid: "matterId",
};

const REQUIRED: (keyof TimeEntry)[] = ["date", "timekeeperName", "role", "hours", "rate", "narrative"];

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");
const round2 = (n: number) => Math.round(n * 100) / 100;

function toNum(v: unknown, field: string, row: number): number {
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  if (s === "") return NaN;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`CSV row ${row}: "${field}" is not a number (${String(v)})`);
  return n;
}

function toRole(v: unknown): Role {
  const r = String(v ?? "").trim().toLowerCase();
  if (r.startsWith("partner") || r === "p" || r === "pt") return "partner";
  if (r.startsWith("paralegal") || r === "pl" || r === "pa" || r === "lc") return "paralegal";
  if (r.startsWith("associate") || r === "a" || r === "as" || r === "assoc") return "associate";
  return r as Role;
}

/**
 * Parse an invoice CSV into TimeEntries. Header names are matched case/punctuation-insensitively
 * (camelCase TimeEntry field names or common LEDES-ish aliases). Entry id = csv `id` column if present,
 * else `${invoiceId}_e${NN}`. amount = csv amount, else hours × rate (rounded to cents).
 */
export function parseInvoiceCsv(csv: string, invoiceId: string): TimeEntry[] {
  if (!csv || !csv.trim()) throw new Error("CSV is empty");
  const res = Papa.parse(csv.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h: string) => h.trim(),
    transform: (v: string) => (typeof v === "string" ? v.trim() : v),
  });

  const headers = res.meta.fields ?? [];
  const map = new Map<string, keyof TimeEntry>(); // csv header -> field
  for (const h of headers) {
    const f = ALIASES[norm(h)];
    if (f && ![...map.values()].includes(f)) map.set(h, f);
  }
  const present = new Set(map.values());
  if (!present.has("timekeeperName") && present.has("timekeeperId")) present.add("timekeeperName");
  const missing = REQUIRED.filter((f) => !present.has(f));
  if (missing.length) {
    throw new Error(`CSV is missing required column(s): ${missing.join(", ")}. Found: ${headers.join(", ") || "(none)"}`);
  }

  const entries: TimeEntry[] = [];
  res.data.forEach((raw, i) => {
    const row = i + 2; // 1-based + header line
    const rec: Record<string, unknown> = {};
    for (const [h, f] of map) rec[f] = raw[h];
    if (Object.values(rec).every((v) => v === undefined || v === null || String(v).trim() === "")) return;

    const hours = toNum(rec.hours, "hours", row);
    const rate = toNum(rec.rate, "rate", row);
    if (Number.isNaN(hours)) throw new Error(`CSV row ${row}: "hours" is required`);
    if (Number.isNaN(rate)) throw new Error(`CSV row ${row}: "rate" is required`);
    const csvAmount = toNum(rec.amount, "amount", row);
    const amount = Number.isNaN(csvAmount) ? round2(hours * rate) : round2(csvAmount);

    const n = entries.length + 1;
    const name = String(rec.timekeeperName ?? "").trim() || String(rec.timekeeperId ?? "").trim();
    const tkId =
      String(rec.timekeeperId ?? "").trim() ||
      name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

    entries.push({
      id: String(rec.id ?? "").trim() || `${invoiceId}_e${String(n).padStart(2, "0")}`,
      invoiceId,
      date: String(rec.date ?? "").trim(),
      timekeeperId: tkId,
      timekeeperName: name,
      role: toRole(rec.role),
      hours,
      rate,
      amount,
      taskCode: String(rec.taskCode ?? "").trim().toUpperCase(),
      activityCode: String(rec.activityCode ?? "").trim().toUpperCase(),
      narrative: String(rec.narrative ?? "").trim(),
      matterId: String(rec.matterId ?? "").trim(),
    });
  });

  if (!entries.length) throw new Error("CSV has no data rows");
  return entries;
}

/* ───────────────────────── LEDES 1998B (G2) ───────────────────────── */

export function isLedes(text: string): boolean {
  return /^﻿?\s*LEDES\s*1998B/i.test(text);
}

/** YYYYMMDD -> YYYY-MM-DD (passes through anything already ISO-like). */
function ledesDate(v: string): string {
  const s = v.trim();
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : s;
}

/**
 * Parse a LEDES 1998B file: line 1 "LEDES1998B[]", line 2 = "|"-separated field names ending "[]",
 * then one record per line ending "[]" (records may also be separated only by "[]").
 * Non-fee lines (EXP/IE expense rows) are kept as entries too; adjustment-only rows with no units are skipped.
 */
export function parseLedes(text: string, invoiceId: string): TimeEntry[] {
  const body = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
  if (!isLedes(body)) throw new Error("Not a LEDES 1998B file (first line must be LEDES1998B[])");
  const records = body
    .replace(/^\s*LEDES\s*1998B\s*\[\]\s*/i, "")
    .split(/\[\]/)
    .map((r) => r.replace(/\n/g, " ").trim())
    .filter(Boolean);
  if (records.length < 2) throw new Error("LEDES file has no line items");
  const header = records[0].split("|").map((h) => h.trim().toUpperCase());
  const idx = (name: string) => header.indexOf(name);
  const need = ["LINE_ITEM_DATE", "LINE_ITEM_NUMBER_OF_UNITS", "LINE_ITEM_UNIT_COST", "LINE_ITEM_DESCRIPTION"];
  const miss = need.filter((n) => idx(n) === -1);
  if (miss.length) throw new Error(`LEDES header is missing field(s): ${miss.join(", ")}`);

  const entries: TimeEntry[] = [];
  records.slice(1).forEach((rec, i) => {
    const cells = rec.split("|").map((c) => c.trim());
    const get = (name: string) => {
      const k = idx(name);
      return k === -1 ? "" : (cells[k] ?? "").trim();
    };
    const row = i + 3;
    const hours = toNum(get("LINE_ITEM_NUMBER_OF_UNITS"), "LINE_ITEM_NUMBER_OF_UNITS", row);
    const rate = toNum(get("LINE_ITEM_UNIT_COST"), "LINE_ITEM_UNIT_COST", row);
    if (Number.isNaN(hours) || Number.isNaN(rate)) return;
    const total = toNum(get("LINE_ITEM_TOTAL"), "LINE_ITEM_TOTAL", row);
    const name = get("TIMEKEEPER_NAME") || get("TIMEKEEPER_ID");
    // LEDES names are often "Last, First"
    const displayName = /^[^,]+,\s*[^,]+$/.test(name) ? name.split(",").map((s) => s.trim()).reverse().join(" ") : name;
    const n = entries.length + 1;
    entries.push({
      id: get("LINE_ITEM_NUMBER") || `${invoiceId}_e${String(n).padStart(2, "0")}`,
      invoiceId,
      date: ledesDate(get("LINE_ITEM_DATE")),
      timekeeperId: get("TIMEKEEPER_ID") || displayName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
      timekeeperName: displayName,
      role: toRole(get("TIMEKEEPER_CLASSIFICATION")),
      hours,
      rate,
      amount: Number.isNaN(total) ? round2(hours * rate) : round2(total),
      taskCode: get("LINE_ITEM_TASK_CODE").toUpperCase(),
      activityCode: get("LINE_ITEM_ACTIVITY_CODE").toUpperCase(),
      narrative: get("LINE_ITEM_DESCRIPTION"),
      matterId: get("LAW_FIRM_MATTER_ID") || get("CLIENT_MATTER_ID"),
    });
  });
  if (!entries.length) throw new Error("LEDES file has no fee line items");
  return entries;
}

/** Auto-detect LEDES 1998B vs CSV. */
export function parseInvoiceFile(text: string, invoiceId: string): TimeEntry[] {
  return isLedes(text) ? parseLedes(text, invoiceId) : parseInvoiceCsv(text, invoiceId);
}
