import { afterEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { llmCacheKey, llmStructured, LlmValidationError, setLlmOverride } from "@/lib/server/llm";

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
