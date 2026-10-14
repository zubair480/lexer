// B7 — zod mirrors of the Rule DSL in @/shared/contract, used to validate LLM compile/repair output.
import { z } from "zod";
import type { Aggregate, Condition, Field, Op, Rule, RuleTest } from "@/shared/contract";

export const TIME_ENTRY_FIELDS = [
  "date", "timekeeperId", "role", "hours", "rate", "amount",
  "taskCode", "activityCode", "narrative", "matterId",
] as const;

export const H1B_FIELDS = [
  "offeredWage", "lcaPrevailingWage", "worksiteZip", "lcaWorksiteZips",
  "filingDate", "requestedStartDate", "daysBeforeStart",
] as const;

export const ALL_FIELDS = [...TIME_ENTRY_FIELDS, ...H1B_FIELDS] as const;

export const OPS = [
  "eq", "neq", "gt", "gte", "lt", "lte",
  "in", "not_in",
  "matches", "contains_any", "word_count_lt", "segment_count_gt", "not_multiple_of",
  "gt_field", "lt_field", "not_in_field",
] as const;

export const FieldSchema = z.enum(ALL_FIELDS);
export const OpSchema = z.enum(OPS);

// Compile-time checks that the enums match the contract unions.
type _FieldCheck = [Field] extends [z.infer<typeof FieldSchema>] ? ([z.infer<typeof FieldSchema>] extends [Field] ? true : never) : never;
type _OpCheck = [Op] extends [z.infer<typeof OpSchema>] ? ([z.infer<typeof OpSchema>] extends [Op] ? true : never) : never;
const _fieldOk: _FieldCheck = true;
const _opOk: _OpCheck = true;
void _fieldOk;
void _opOk;

export const LeafConditionSchema = z.object({
  field: FieldSchema,
  op: OpSchema,
  value: z.any(),
});

export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({ all: z.array(ConditionSchema) }),
    z.object({ any: z.array(ConditionSchema) }),
    z.object({ not: ConditionSchema }),
    LeafConditionSchema,
  ]),
) as unknown as z.ZodType<Condition>;

export const AggregateSchema = z.object({
  groupBy: z.array(FieldSchema),
  fn: z.enum(["count_distinct", "sum", "count"]),
  field: FieldSchema,
  op: z.enum(["gt", "gte", "lt", "lte"]),
  value: z.coerce.number(),
}) as unknown as z.ZodType<Aggregate>;

export const SeveritySchema = z.enum(["reject", "reduce", "warn"]);

/** LLM-facing rule schema. id/clauseId/recordType/scope are overwritten by the compiler anyway. */
export const RuleSchema = z.object({
  id: z.string().optional().default(""),
  clauseId: z.string().optional().default(""),
  title: z.string(),
  severity: SeveritySchema,
  scope: z.enum(["entry", "group"]).optional().default("entry"),
  recordType: z.enum(["time_entry", "h1b_petition"]).optional().default("time_entry"),
  when: ConditionSchema.nullish(),
  // Aggregate first: it has required keys a Condition never has.
  violation: z.union([AggregateSchema, ConditionSchema]),
  adjustment: z
    .object({ type: z.literal("rate_factor"), factor: z.coerce.number() })
    .nullish(),
  message: z.string(),
});

export const RuleTestSchema = z.object({
  name: z.string(),
  records: z.array(z.record(z.any())),
  expectFlagged: z.boolean(),
});

export const CompileOutputSchema = z.object({
  rule: RuleSchema,
  tests: z.array(RuleTestSchema),
});

export type LlmRule = z.infer<typeof RuleSchema>;
export type LlmRuleTest = z.infer<typeof RuleTestSchema>;
export type CompileOutput = z.infer<typeof CompileOutputSchema>;

/** Contract-shaped aliases for convenience. */
export type { Rule, RuleTest, Condition, Aggregate };
