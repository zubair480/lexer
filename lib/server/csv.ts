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
