import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { segmentRulebook } from "@/lib/compiler/segment";
import { classifyClause, heuristicClassify } from "@/lib/compiler/classify";
import { setLlmOverride } from "@/lib/server/llm";
import type { Clause } from "@/shared/contract";

const ACME = path.join(process.cwd(), "data", "acme-ocg.md");
const hasAcme = fs.existsSync(ACME);

function expectExactSlices(src: string, clauses: Clause[]) {
  for (const c of clauses) {
    expect(src.slice(c.start, c.end)).toBe(c.text);
    expect(c.text).toBe(c.text.trim());
    expect(c.text.length).toBeGreaterThan(0);
  }
}

afterEach(() => setLlmOverride(null));

describe("segmentRulebook", () => {
  it.skipIf(!hasAcme)("segments data/acme-ocg.md into 3.1–3.7 with exact offsets", async () => {
    const src = fs.readFileSync(ACME, "utf8");
    const clauses = await segmentRulebook("rb_acme_ocg", src);
    expect(clauses.map((c) => c.number)).toEqual(["3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7"]);
    expect(clauses[0].id).toBe("rb_acme_ocg__3.1");
    expect(clauses[0].title).toBe("Block billing");
    expect(clauses.every((c) => c.kind === undefined)).toBe(true);
    expectExactSlices(src, clauses);
  });

  const USCIS = path.join(process.cwd(), "data", "uscis-h1b.md");
  it.skipIf(!fs.existsSync(USCIS))("segments data/uscis-h1b.md into 4.1–4.3", async () => {
    const src = fs.readFileSync(USCIS, "utf8");
    const clauses = await segmentRulebook("rb_uscis_h1b", src);
    expect(clauses.map((c) => c.number)).toEqual(["4.1", "4.2", "4.3"]);
    expectExactSlices(src, clauses);
  });

  it("handles CRLF, intro text, mixed heading styles and dashes", async () => {
    const src = [
      "# Guidelines",
      "",
      "Intro paragraph that is not a clause.",
      "",
      "### 3.1 Block billing",
      "Each entry must describe a single task.",
      "Second line of body.",
      "",
      "## 3.2 Vague narratives",
      "Entries under five words will be rejected.",
      "",
      "3.3 Staffing —",
      "No more than two timekeepers per deposition.",
      "3.4 Travel – Travel is billed at 50% of rate.",
      "",
    ].join("\r\n");
    const clauses = await segmentRulebook("rb_x", src);
    expect(clauses.map((c) => c.number)).toEqual(["3.1", "3.2", "3.3", "3.4"]);
    expect(clauses.map((c) => c.title)).toEqual(["Block billing", "Vague narratives", "Staffing", "Travel"]);
    expect(clauses[0].text).toBe("Each entry must describe a single task.\r\nSecond line of body.");
    expect(clauses[3].text).toBe("Travel is billed at 50% of rate.");
    expect(clauses[2].id).toBe("rb_x__3.3");
    expectExactSlices(src, clauses);
  });

  it("falls back to the LLM when there are no headings and locates offsets", async () => {
    const src = "Preamble.\n\nTimekeepers shall not bill more than ten hours per day.\n\nAll time must be reasonable.\n";
    setLlmOverride(async (opts) => {
      expect(opts.name).toBe("segment_rulebook");
      return {
        clauses: [
          { number: "1", title: "Daily cap", text: "Timekeepers shall not bill more than ten hours per day." },
          { number: "2", title: "Reasonableness", text: "All time must be reasonable." },
        ],
      };
    });
    const clauses = await segmentRulebook("rb_y", src);
    expect(clauses.map((c) => c.id)).toEqual(["rb_y__1", "rb_y__2"]);
    expectExactSlices(src, clauses);
  });
});

describe("classifyClause", () => {
  const clause: Clause = {
    id: "rb_acme_ocg__3.7",
    rulebookId: "rb_acme_ocg",
    number: "3.7",
    title: "Reasonableness",
    text: "All time billed must be reasonable and necessary to the representation.",
    start: 0,
    end: 0,
  };

  it("uses the LLM result", async () => {
    setLlmOverride(async (opts) => {
      expect(opts.name).toBe("classify_clause");
      expect(opts.user).toContain("narrative");
      return { kind: "judgment", reason: "Requires discretion about what is reasonable." };
    });
    const out = await classifyClause(clause, "time_entry");
    expect(out).toEqual({ kind: "judgment", reason: "Requires discretion about what is reasonable." });
  });

  it("falls back to heuristic on LLM error", async () => {
    setLlmOverride(async () => {
      throw new Error("boom");
    });
    const out = await classifyClause(clause, "time_entry");
    expect(out.kind).toBe("judgment");
    expect(out.reason).toContain("(heuristic)");

    const cap = await classifyClause(
      { ...clause, number: "3.6", title: "Daily cap", text: "No timekeeper may bill more than 10 hours on this matter in a single day." },
      "time_entry",
    );
    expect(cap.kind).toBe("compilable");
  });

  it("heuristic marks travel 50% as compilable", () => {
    expect(
      heuristicClassify({ number: "3.4", title: "Travel", text: "Non-working travel time is billed at 50% of the timekeeper's standard rate." }).kind,
    ).toBe("compilable");
  });
});
