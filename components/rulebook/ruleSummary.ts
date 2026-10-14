import type { Aggregate, Condition, Field, Op, Rule } from "@/shared/contract";

const FIELD_LABEL: Record<Field, string> = {
  date: "date",
  timekeeperId: "timekeeper",
  role: "role",
  hours: "hours",
  rate: "rate",
  amount: "amount",
  taskCode: "task code",
  activityCode: "activity code",
  narrative: "narrative",
  matterId: "matter",
  offeredWage: "offered wage",
  lcaPrevailingWage: "LCA prevailing wage",
  worksiteZip: "worksite ZIP",
  lcaWorksiteZips: "LCA worksite ZIPs",
  filingDate: "filing date",
  requestedStartDate: "requested start date",
  daysBeforeStart: "days before start",
};

function label(f: unknown): string {
  return FIELD_LABEL[f as Field] ?? String(f);
}

function fmtValue(v: unknown): string {
  if (Array.isArray(v)) {
    const items = v.slice(0, 4).map((x) => (typeof x === "string" ? `"${x}"` : String(x)));
    return items.join(", ") + (v.length > 4 ? `, +${v.length - 4} more` : "");
  }
  if (typeof v === "string") return `"${v}"`;
  return String(v);
}

function opPhrase(field: Field, op: Op, value: unknown): string {
  const f = label(field);
  switch (op) {
    case "eq": return `${f} is ${fmtValue(value)}`;
    case "neq": return `${f} is not ${fmtValue(value)}`;
    case "gt": return `${f} > ${fmtValue(value)}`;
    case "gte": return `${f} ≥ ${fmtValue(value)}`;
    case "lt": return `${f} < ${fmtValue(value)}`;
    case "lte": return `${f} ≤ ${fmtValue(value)}`;
    case "in": return `${f} is one of ${fmtValue(value)}`;
    case "not_in": return `${f} is not one of ${fmtValue(value)}`;
    case "matches": return `${f} matches /${String(value)}/`;
    case "contains_any": return `${f} mentions ${fmtValue(value)}`;
    case "word_count_lt": return `${f} has fewer than ${fmtValue(value)} words`;
    case "segment_count_gt": {
      const n = Number(value);
      return `${f} lists more than ${n} task${n === 1 ? "" : "s"}`;
    }
    case "not_multiple_of": return `${f} is not a multiple of ${fmtValue(value)}`;
    case "gt_field": return `${f} exceeds ${label(value)}`;
    case "lt_field": return `${f} is below ${label(value)}`;
    case "not_in_field": return `${f} is not in ${label(value)}`;
    default: return `${f} ${String(op)} ${fmtValue(value)}`;
  }
}

function describeCondition(c: Condition, depth = 0): string {
  if ("all" in c) {
    const parts = c.all.map((x) => describeCondition(x, depth + 1));
    const s = parts.join(" and ");
    return depth > 0 && parts.length > 1 ? `(${s})` : s;
  }
  if ("any" in c) {
    const parts = c.any.map((x) => describeCondition(x, depth + 1));
    const s = parts.join(" or ");
    return depth > 0 && parts.length > 1 ? `(${s})` : s;
  }
  if ("not" in c) return `not ${describeCondition(c.not, depth + 1)}`;
  return opPhrase(c.field, c.op, c.value);
}

function isAggregate(v: Condition | Aggregate): v is Aggregate {
  return typeof v === "object" && v !== null && "groupBy" in v && "fn" in v;
}

const AGG_OP: Record<Aggregate["op"], string> = { gt: ">", gte: "≥", lt: "<", lte: "≤" };

function describeAggregate(a: Aggregate): string {
  const groups = a.groupBy.map(label).join(" + ");
  const fn =
    a.fn === "count_distinct" ? `distinct ${label(a.field)}s`
    : a.fn === "sum" ? `total ${label(a.field)}`
    : `count of ${label(a.field)}`;
  return `${fn} per ${groups} ${AGG_OP[a.op]} ${a.value}`;
}

/** Turn a Rule AST into a plain-English sentence. Falls back to rule.message. */
export function summarizeRule(rule: Rule | null | undefined): string {
  if (!rule) return "";
  try {
    const subject = rule.recordType === "h1b_petition" ? "petitions" : "entries";
    let s: string;
    if (isAggregate(rule.violation)) {
      s = `Flags groups where ${describeAggregate(rule.violation)}`;
    } else {
      s = `Flags ${subject} where ${describeCondition(rule.violation)}`;
    }
    if (rule.when) s += `, when ${describeCondition(rule.when)}`;
    if (rule.adjustment?.type === "rate_factor") {
      s += ` — billed at ${Math.round(rule.adjustment.factor * 100)}% of rate`;
    }
    s += ".";
    if (s.length > 260) return rule.message;
    return s;
  } catch {
    return rule.message;
  }
}
