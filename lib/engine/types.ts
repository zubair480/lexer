// Engine-internal types (B1). Contract types live in @/shared/contract.
import type { Aggregate, Condition, Severity } from "@/shared/contract";

export type {
  Aggregate, Condition, Field, Op, Rule, RuleTest, Severity, TestResult,
  TimeEntry, H1BPetition, RecordType,
} from "@/shared/contract";

/** A TimeEntry or H1BPetition (possibly partial, e.g. inside a RuleTest). Must have `id` when evaluated. */
export type EngineRecord = Record<string, unknown> & { id?: string };

/** What the engine returns. Routes turn this into a contract `Flag`. */
export interface EngineFlag {
  ruleId: string;
  clauseId: string;
  entryId: string;
  severity: Severity;
  message: string;
  impactUsd: number;
}

export function isAggregate(v: Condition | Aggregate): v is Aggregate {
  return typeof v === "object" && v !== null && "groupBy" in v && "fn" in v;
}
