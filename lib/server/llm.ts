// Server-only LLM client: OpenAI Responses API or Anthropic Claude (forced tool use) with
// structured outputs (zod -> JSON schema), disk cache (data/cache/<sha256>.json) and DEMO_REPLAY support.
// Provider order: OPENAI_API_KEY => openai; else ANTHROPIC_API_KEY => anthropic; else cache/offline.
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

function hasOpenAiKey(): boolean {
  return !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim() !== "";
}

function hasAnthropicKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim() !== "";
}

type Provider = "openai" | "anthropic";

/** Live provider, or null when no key is configured. */
function liveProvider(): Provider | null {
  if (hasOpenAiKey()) return "openai";
  if (hasAnthropicKey()) return "anthropic";
  return null;
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

/** "openai" | "anthropic" | "replay" | "offline" — for status displays / logs. */
export function llmMode(): "openai" | "anthropic" | "replay" | "offline" {
  if (forceOffline()) return "offline";
  const p = liveProvider();
  if (p) return p;
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

function getAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
}

/**
 * Cache-key model id. OpenAI keeps the bare model id (existing cache files stay valid);
 * Anthropic is namespaced so provider+model are both part of the key.
 */
function cacheModelId(provider: Provider): string {
  return provider === "openai" ? getModel() : `anthropic:${getAnthropicModel()}`;
}

// ---- Anthropic (loaded lazily so the app still runs when @anthropic-ai/sdk is not installed) ----
type AnthropicMessagesClient = {
  messages: { create: (params: Record<string, unknown>) => Promise<{ content?: Array<Record<string, unknown>> }> };
};
type AnthropicCtor = new (opts: { apiKey?: string; timeout?: number; maxRetries?: number }) => AnthropicMessagesClient;

let anthropicClient: AnthropicMessagesClient | null = null;
let anthropicClientKey: string | undefined;

async function getAnthropicClient(): Promise<AnthropicMessagesClient> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicClient && anthropicClientKey === apiKey) return anthropicClient;
  let mod: Record<string, unknown>;
  try {
    const spec = "@anthropic-ai/sdk"; // variable + webpackIgnore: resolved at runtime, optional dependency
    mod = (await import(/* webpackIgnore: true */ spec)) as Record<string, unknown>;
  } catch {
    throw new Error("ANTHROPIC_API_KEY is set but @anthropic-ai/sdk is not installed");
  }
  const def = mod.default as { default?: unknown } | undefined;
  const Ctor = ((def && typeof def === "object" && def.default) || mod.default || mod.Anthropic) as AnthropicCtor;
  anthropicClient = new Ctor({ apiKey, timeout: 120_000, maxRetries: 0 });
  anthropicClientKey = apiKey;
  return anthropicClient;
}

/** Anthropic tool input_schema must be an object schema with type "object" at the root. */
function toToolInputSchema(js: Record<string, unknown>): Record<string, unknown> {
  if (js.type === "object") return js;
  return { type: "object", properties: { result: js }, required: ["result"] };
}

function sanitizeToolName(name: string): string {
  const n = name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return n || "result";
}

async function callAnthropic(model: string, name: string, system: string, user: string, jsonSchema: Record<string, unknown>): Promise<unknown> {
  const delays = [1000, 2000, 4000];
  const toolName = sanitizeToolName(name);
  const inputSchema = toToolInputSchema(jsonSchema);
  const wrapped = inputSchema !== jsonSchema;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const c = await getAnthropicClient();
      const response = await c.messages.create({
        model,
        max_tokens: 8000,
        system,
        messages: [{ role: "user", content: user }],
        tools: [{ name: toolName, description: "Return the structured result", input_schema: inputSchema }],
        tool_choice: { type: "tool", name: toolName },
      });
      const block = (response.content ?? []).find((b) => b && b.type === "tool_use");
      if (!block) {
        throw new LlmValidationError(`LLM output for "${name}" had no tool_use block`, response.content, [{ message: "missing tool_use" }]);
      }
      const input = block.input;
      if (wrapped && input && typeof input === "object" && "result" in (input as Record<string, unknown>)) {
        return (input as Record<string, unknown>).result;
      }
      return input;
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
  // Anthropic SDK errors (duck-typed: the SDK is loaded lazily). 529 = overloaded.
  if (err instanceof LlmValidationError) return false;
  const e = err as { status?: unknown; name?: string; error?: { type?: string; error?: { type?: string } } } | null;
  if (e && typeof e === "object") {
    if (e.name === "APIConnectionError" || e.name === "APIConnectionTimeoutError") return true;
    if (e.error?.type === "overloaded_error" || e.error?.error?.type === "overloaded_error") return true;
    if (typeof e.status === "number") return e.status === 429 || e.status === 529 || e.status >= 500;
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

  const provider = liveProvider();
  // With a key: only that provider's cache. Without: any provider's cache (openai first), then offline.
  const candidates: Provider[] = provider ? [provider] : ["openai", "anthropic"];
  const file = path.join(cacheDir(), `${llmCacheKey(cacheModelId(candidates[0]), name, system, user)}.json`);

  // Cache read
  for (const p of candidates) {
    const f = path.join(cacheDir(), `${llmCacheKey(cacheModelId(p), name, system, user)}.json`);
    let cached: { output: unknown } | null = null;
    try {
      cached = JSON.parse(await fs.readFile(f, "utf8"));
    } catch {
      cached = null;
    }
    if (cached && "output" in cached) {
      if (isReplay()) await sleep(300 + Math.floor(Math.random() * 600));
      return validate(schema, cached.output, name);
    }
  }

  if (!provider) {
    // No key + cache miss => deterministic offline responder (never cached, so a real key later is unaffected).
    return respondOffline(schema, name, system, user);
  }

  const model = provider === "openai" ? getModel() : getAnthropicModel();
  const jsonSchema = toJsonSchema(schema as z.ZodTypeAny);
  const raw =
    provider === "openai"
      ? await callOpenAI(model, name, system, user, jsonSchema)
      : await callAnthropic(model, name, system, user, jsonSchema);
  const output = validate(schema, raw, name); // throws before caching invalid outputs

  try {
    await fs.mkdir(cacheDir(), { recursive: true });
    await fs.writeFile(file, JSON.stringify({ name, provider, model, createdAt: new Date().toISOString(), output: raw }, null, 2), "utf8");
  } catch {
    // cache write failure is non-fatal
  }
  return output;
}
