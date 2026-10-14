import type { EngineRecord, Rule } from "./types";

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function recordAmount(record: EngineRecord): number {
  const amt = toNum(record.amount);
  if (amt !== null) return amt;
  const hours = toNum(record.hours);
  const rate = toNum(record.rate);
  if (hours !== null && rate !== null) return hours * rate;
  return 0;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function computeImpact(rule: Rule, record: EngineRecord): number {
  const amount = recordAmount(record);
  let impact = 0;
  if (rule.severity === "reject") impact = amount;
  else if (rule.severity === "reduce") {
    const f = rule.adjustment?.factor;
    impact = typeof f === "number" && Number.isFinite(f) ? amount * (1 - f) : amount;
  } else impact = 0;
  const r = round2(impact);
  return Object.is(r, -0) ? 0 : r;
}
