// B2 — pure operator semantics for the rule engine. No I/O, no Date.now(), no LLM.
import type { EngineRecord, Field, Op } from "./types";

const DAY_MS = 86_400_000;

function isMissing(v: unknown): boolean {
  return v === undefined || v === null;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Collapse internal whitespace, trim, lowercase. */
function norm(v: unknown): string {
  return String(v).replace(/\s+/g, " ").trim().toLowerCase();
}

function parseUtcDate(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) ? t : null;
}

export function getField(record: EngineRecord, field: Field): unknown {
  const key = field as unknown as string;
  const direct = record[key];
  if (!isMissing(direct)) return direct;
  if (key === "daysBeforeStart") {
    const start = parseUtcDate(record["requestedStartDate"]);
    const filed = parseUtcDate(record["filingDate"]);
    if (start === null || filed === null) return undefined;
    return Math.round((start - filed) / DAY_MS);
  }
  return direct;
}

/** Split on ";", word-bounded " and ", "&", "," and count non-empty trimmed parts. */
export function segmentCount(text: string): number {
  if (typeof text !== "string") return 0;
  return text
    .split(/;|&|,|\band\b/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0).length;
}

function looseEq(a: unknown, b: unknown): boolean {
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na !== null && nb !== null) return na === nb;
  return norm(a) === norm(b);
}

/** -1 / 0 / 1, or null if incomparable. Numeric first, then string (ISO dates sort lexicographically). */
function compare(a: unknown, b: unknown): number | null {
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na !== null && nb !== null) return na < nb ? -1 : na > nb ? 1 : 0;
  if (typeof a === "string" && typeof b === "string") {
    const sa = a.trim();
    const sb = b.trim();
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  }
  return null;
}

function toList(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  if (isMissing(v)) return [];
  return [v];
}

function wordCount(text: unknown): number {
  return String(text).trim().split(/\s+/).filter((w) => w.length > 0).length;
}

export function applyOp(op: Op, actual: unknown, value: unknown, record: EngineRecord): boolean {
  // Never flag on missing data.
  if (isMissing(actual)) return false;

  switch (op) {
    case "eq":
      return looseEq(actual, value);
    case "neq":
      if (isMissing(value)) return false;
      return !looseEq(actual, value);
    case "gt": { const c = compare(actual, value); return c !== null && c > 0; }
    case "gte": { const c = compare(actual, value); return c !== null && c >= 0; }
    case "lt": { const c = compare(actual, value); return c !== null && c < 0; }
    case "lte": { const c = compare(actual, value); return c !== null && c <= 0; }
    case "in":
      return toList(value).some((v) => looseEq(actual, v));
    case "not_in":
      return !toList(value).some((v) => looseEq(actual, v));
    case "matches": {
      if (typeof value !== "string") return false;
      try {
        const re = new RegExp(value, "i");
        const raw = String(actual);
        return re.test(raw) || re.test(raw.replace(/\s+/g, " ").trim());
      } catch {
        return false;
      }
    }
    case "contains_any": {
      const hay = norm(actual);
      const phrases = Array.isArray(value) ? value : isMissing(value) ? [] : [value];
      return phrases
        .map((p) => norm(p))
        .some((p) => p.length > 0 && hay.includes(p));
    }
    case "word_count_lt": {
      const n = toNumber(value);
      return n !== null && wordCount(actual) < n;
    }
    case "segment_count_gt": {
      const n = toNumber(value);
      return n !== null && segmentCount(String(actual)) > n;
    }
    case "not_multiple_of": {
      const a = toNumber(actual);
      const m = toNumber(value);
      if (a === null || m === null || m === 0) return false;
      const q = a / m;
      return Math.abs(q - Math.round(q)) > 1e-6;
    }
    case "gt_field":
    case "lt_field": {
      if (typeof value !== "string") return false;
      const other = getField(record, value as Field);
      if (isMissing(other)) return false;
      const c = compare(actual, other);
      if (c === null) return false;
      return op === "gt_field" ? c > 0 : c < 0;
    }
    case "not_in_field": {
      if (typeof value !== "string") return false;
      const other = getField(record, value as Field);
      if (isMissing(other)) return false;
      const a = norm(actual);
      return !toList(other).some((v) => norm(v) === a);
    }
    default:
      return false;
  }
}
