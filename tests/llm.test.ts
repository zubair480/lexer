import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { llmCacheKey, llmMode, llmStructured, LlmValidationError, setLlmOverride } from "@/lib/server/llm";

const anthropicCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  class Anthropic {
    messages = { create: anthropicCreate };
  }
  return { default: Anthropic, Anthropic };
});

const Schema = z.object({ kind: z.enum(["compilable", "judgment"]), reason: z.string() });

describe("llm client", () => {
  afterEach(() => setLlmOverride(null));

  it("uses the override and validates output", async () => {
    setLlmOverride(async () => ({ kind: "judgment", reason: "vague" }));
    const out = await llmStructured({ name: "t_override", schema: Schema, system: "s", user: "u" });
    expect(out).toEqual({ kind: "judgment", reason: "vague" });
  });

  it("throws LlmValidationError on schema mismatch", async () => {
    setLlmOverride(async () => ({ kind: "nope" }));
    const p = llmStructured({ name: "t_bad", schema: Schema, system: "s", user: "u" });
    await expect(p).rejects.toBeInstanceOf(LlmValidationError);
    await p.catch((e: LlmValidationError) => {
      expect(e.raw).toEqual({ kind: "nope" });
      expect(Array.isArray(e.issues)).toBe(true);
    });
  });

  it("reads a cached fixture without a key", async () => {
    const savedKey = process.env.OPENAI_API_KEY;
    const savedReplay = process.env.DEMO_REPLAY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.DEMO_REPLAY;
    const model = process.env.OPENAI_MODEL || "gpt-5";
    const system = "sys-fixture";
    const user = `user-fixture-${Date.now()}`;
    const key = llmCacheKey(model, "t_cache", system, user);
    const dir = path.join(process.cwd(), "data", "cache");
    const file = path.join(dir, `${key}.json`);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(file, JSON.stringify({ name: "t_cache", model, createdAt: "x", output: { kind: "compilable", reason: "numeric cap" } }));
    try {
      const out = await llmStructured({ name: "t_cache", schema: Schema, system, user });
      expect(out.kind).toBe("compilable");
      // miss with no key => offline responder (B14); unknown name => no handler
      await expect(llmStructured({ name: "t_cache", schema: Schema, system, user: user + "-miss" })).rejects.toThrow(/offline: no handler|LLM unavailable/);
    } finally {
      await fs.unlink(file).catch(() => {});
      if (savedKey !== undefined) process.env.OPENAI_API_KEY = savedKey;
      if (savedReplay !== undefined) process.env.DEMO_REPLAY = savedReplay;
    }
  });
});

describe("llm provider selection", () => {
  const KEYS = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "LLM_MODE", "DEMO_REPLAY", "LLM_OFFLINE_DELAY_MS"] as const;
  let saved: Record<string, string | undefined> = {};
  const stash = () => {
    saved = {};
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  };
  const restore = () => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  };
  afterEach(() => {
    restore();
    anthropicCreate.mockReset();
  });

  it("defaults to offline with no keys", () => {
    stash();
    expect(llmMode()).toBe("offline");
  });

  it("prefers openai, then anthropic; LLM_MODE=offline forces offline", () => {
    stash();
    process.env.ANTHROPIC_API_KEY = "test-anthropic";
    expect(llmMode()).toBe("anthropic");
    process.env.OPENAI_API_KEY = "test-openai";
    expect(llmMode()).toBe("openai");
    process.env.LLM_MODE = "offline";
    expect(llmMode()).toBe("offline");
  });

  it("uses Claude forced tool use when only ANTHROPIC_API_KEY is set", async () => {
    stash();
    process.env.ANTHROPIC_API_KEY = "test-anthropic";
    process.env.ANTHROPIC_MODEL = "claude-test-model";
    anthropicCreate.mockResolvedValue({
      content: [{ type: "tool_use", id: "tu_1", name: "t_anthropic", input: { kind: "compilable", reason: "numeric cap" } }],
    });
    const user = `u-anthropic-${Date.now()}`;
    const key = llmCacheKey("anthropic:claude-test-model", "t_anthropic", "s", user);
    const file = path.join(process.cwd(), "data", "cache", `${key}.json`);
    try {
      const out = await llmStructured({ name: "t_anthropic", schema: Schema, system: "s", user });
      expect(out).toEqual({ kind: "compilable", reason: "numeric cap" });
      expect(anthropicCreate).toHaveBeenCalledTimes(1);
      const params = anthropicCreate.mock.calls[0][0];
      expect(params.model).toBe("claude-test-model");
      expect(params.system).toBe("s");
      expect(params.tool_choice).toEqual({ type: "tool", name: "t_anthropic" });
      expect(params.tools[0].input_schema.type).toBe("object");
      // cached under provider+model key => second call does not hit the SDK
      const again = await llmStructured({ name: "t_anthropic", schema: Schema, system: "s", user });
      expect(again.kind).toBe("compilable");
      expect(anthropicCreate).toHaveBeenCalledTimes(1);
    } finally {
      await fs.unlink(file).catch(() => {});
    }
  });

  it("throws LlmValidationError when Claude tool input fails the schema", async () => {
    stash();
    process.env.ANTHROPIC_API_KEY = "test-anthropic";
    anthropicCreate.mockResolvedValue({ content: [{ type: "tool_use", id: "tu_2", name: "t_anthropic_bad", input: { kind: "nope" } }] });
    await expect(
      llmStructured({ name: "t_anthropic_bad", schema: Schema, system: "s", user: `u-bad-${Date.now()}` }),
    ).rejects.toBeInstanceOf(LlmValidationError);
  });
});
