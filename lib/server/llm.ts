// Server-only LLM client: OpenAI Responses API + structured outputs (zod -> JSON schema),
// disk cache (data/cache/<sha256>.json) and DEMO_REPLAY support.
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { offlineRespond } from "./offline";

export type LlmCallOpts = { name: string; system: string; user: string };
export type LlmOverride = (opts: LlmCallOpts) => Promise<unknown>;

export class LlmValidationError extends Error {
  raw: unknown;
  issues: unknown;
  constructor(message: string, raw: unknown, issues: unknown) {
    super(message);
    this.name = "LlmValidationError";
    this.raw = raw;
    this.issues = issues;
  }
}

let override: LlmOverride | null = null;
let client: OpenAI | null = null;

export function setLlmOverride(fn: LlmOverride | null): void {
  override = fn;
}

function hasKey(): boolean {
  return !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim() !== "";
}

function isReplay(): boolean {
  return process.env.DEMO_REPLAY === "1";
}

/** LLM_MODE=offline forces the deterministic offline responder even when a key exists. */
function forceOffline(): boolean {
  return (process.env.LLM_MODE ?? "").trim().toLowerCase() === "offline";
}

/** Offline mode is always available (deterministic responder), so the demo never needs a key. */
export function llmAvailable(): boolean {
  return true;
}

/** "openai" | "replay" | "offline" — for status displays / logs. */
export function llmMode(): "openai" | "replay" | "offline" {
  if (forceOffline()) return "offline";
  if (hasKey()) return "openai";
  return isReplay() ? "replay" : "offline";
}

function offlineDelayMs(): number {
  const v = process.env.LLM_OFFLINE_DELAY_MS;
  if (v !== undefined && v.trim() !== "" && Number.isFinite(Number(v))) return Math.max(0, Number(v));
  return 400 + Math.floor(Math.random() * 800); // 400–1200 ms so the live stream animates
}

async function respondOffline<T>(schema: z.ZodType<T>, name: string, system: string, user: string): Promise<T> {
  const raw = await offlineRespond({ name, system, user });
  const ms = offlineDelayMs();
  if (ms > 0) await sleep(ms);
  return validate(schema, raw, name);
}

function getModel(): string {
  return process.env.OPENAI_MODEL || "gpt-5";
}

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 60_000, maxRetries: 0 });
  }
  return client;
}

function cacheDir(): string {
  return path.join(process.cwd(), "data", "cache");
}

export function llmCacheKey(model: string, name: string, system: string, user: string): string {
  return createHash("sha256").update(JSON.stringify({ model, name, system, user })).digest("hex");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function toJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  try {
    const js = zodToJsonSchema(schema, { $refStrategy: "none" }) as Record<string, unknown>;
    delete js.$schema;
    if (!js || typeof js !== "object" || Object.keys(js).length === 0) return { type: "object" };
    return js;
  } catch {
    return { type: "object" };
  }
}

function validate<T>(schema: z.ZodType<T>, raw: unknown, name: string): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new LlmValidationError(`LLM output for "${name}" failed schema validation`, raw, parsed.error.issues);
  }
  return parsed.data;
}

function isRetryable(err: unknown): boolean {
  if (err instanceof OpenAI.APIConnectionError) return true; // includes timeouts
  if (err instanceof OpenAI.APIError) {
    const s = err.status;
    if (s === undefined) return true;
    return s === 429 || s >= 500;
  }
  // Raw network errors (fetch failures)
  const code = (err as { code?: string } | null)?.code;
  if (code && ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "UND_ERR_SOCKET"].includes(code)) {
    return true;
  }
  return err instanceof TypeError && /fetch/i.test(err.message);
}

async function callOpenAI(model: string, name: string, system: string, user: string, jsonSchema: Record<string, unknown>): Promise<unknown> {
  const delays = [1000, 2000, 4000];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const response = await getClient().responses.create({
        model,
        input: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        text: { format: { type: "json_schema", name, schema: jsonSchema, strict: false } },
      });
      const text = response.output_text;
      try {
        return JSON.parse(text);
      } catch {
        throw new LlmValidationError(`LLM output for "${name}" was not valid JSON`, text, [{ message: "invalid JSON" }]);
      }
    } catch (err) {
      lastErr = err;
      if (attempt < delays.length && isRetryable(err)) {
        await sleep(delays[attempt]);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export async function llmStructured<T>(opts: {
  name: string;
  schema: z.ZodType<T>;
  system: string;
  user: string;
}): Promise<T> {
  const { name, schema, system, user } = opts;

  if (override) {
    const raw = await override({ name, system, user });
    return validate(schema, raw, name);
  }

  if (forceOffline()) return respondOffline(schema, name, system, user);

  const model = getModel();
  const key = llmCacheKey(model, name, system, user);
  const file = path.join(cacheDir(), `${key}.json`);

  // Cache read
  let cached: { output: unknown } | null = null;
  try {
    cached = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    cached = null;
  }
  if (cached && "output" in cached) {
    if (isReplay()) await sleep(300 + Math.floor(Math.random() * 600));
    return validate(schema, cached.output, name);
  }

  if (!hasKey()) {
    // No key + cache miss => deterministic offline responder (never cached, so a real key later is unaffected).
    return respondOffline(schema, name, system, user);
  }

  const raw = await callOpenAI(model, name, system, user, toJsonSchema(schema as z.ZodTypeAny));
  const output = validate(schema, raw, name); // throws before caching invalid outputs

  try {
    await fs.mkdir(cacheDir(), { recursive: true });
    await fs.writeFile(file, JSON.stringify({ name, model, createdAt: new Date().toISOString(), output: raw }, null, 2), "utf8");
  } catch {
    // cache write failure is non-fatal
  }
  return output;
}
