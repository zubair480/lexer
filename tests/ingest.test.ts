import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { segmentRulebook } from "@/lib/compiler/segment";
import { extractText, normalizeText, detectKind, UnsupportedFileError } from "@/lib/server/extract";
import { parseInvoiceCsv, parseInvoiceFile, parseLedes, isLedes } from "@/lib/server/csv";
import { setLlmOverride } from "@/lib/server/llm";
import type { Clause } from "@/shared/contract";

afterEach(() => setLlmOverride(null));

function exact(src: string, clauses: Clause[]) {
  for (const c of clauses) {
    expect(src.slice(c.start, c.end)).toBe(c.text);
    expect(c.text).toBe(c.text.trim());
    expect(c.text.length).toBeGreaterThan(0);
  }
}

describe("robust segmentation", () => {
  it("'1.' numbered top-level headings with bodies", async () => {
    const src = "Billing Guidelines\n\n1. Block billing\nEach entry must describe one task.\n\n2. Travel\nTravel is billed at 50% of the rate.\n";
    const cs = await segmentRulebook("rb", src);
    expect(cs.map((c) => c.number)).toEqual(["1", "2"]);
    expect(cs.map((c) => c.title)).toEqual(["Block billing", "Travel"]);
    exact(src, cs);
  });

  it("'Section N.' headings with N.N 'Title. Body' sub-clauses and a table of contents", async () => {
    const src = fs.readFileSync(path.join(process.cwd(), "data", "samples", "globex-guidelines.txt"), "utf8");
    const cs = await segmentRulebook("rb_g", src);
    expect(cs.map((c) => c.number)).toEqual(["1", "2.1", "2.2", "2.3", "2.4", "3.1", "3.2", "3.3", "4.1"]);
    expect(cs.find((c) => c.number === "2.4")!.title).toBe("Daily limit");
    expect(cs.find((c) => c.number === "2.4")!.text).toMatch(/^No timekeeper may bill more than 12 hours/);
    expect(new Set(cs.map((c) => c.id)).size).toBe(cs.length);
    exact(src, cs);
  });

  it("'Section 4.2 Title', '§ 4.3', 'Rule 5:' headings", async () => {
    const src = [
      "Section 4.1 Rates",
      "Rates are fixed for the matter and must not increase.",
      "§ 4.2 Expenses",
      "Meals are not reimbursable.",
      "Rule 5: Daily cap",
      "No more than 10 hours per day may be billed.",
    ].join("\n");
    const cs = await segmentRulebook("rb", src);
    expect(cs.map((c) => c.number)).toEqual(["4.1", "4.2", "5"]);
    expect(cs.map((c) => c.title)).toEqual(["Rates", "Expenses", "Daily cap"]);
    exact(src, cs);
  });

  it("Article headings with (a) sub-items folded into parent", async () => {
    const src = [
      "ARTICLE I - Time entries",
      "Time entries must:",
      "(a) be in 0.1 hour increments;",
      "(b) describe a single task.",
      "",
      "Article II. Staffing",
      "No more than two attorneys shall attend a deposition.",
    ].join("\n");
    const cs = await segmentRulebook("rb", src);
    expect(cs.map((c) => c.number)).toEqual(["I", "II"]);
    expect(cs[0].text).toContain("(b) describe a single task.");
    exact(src, cs);
  });

  it("bullets under a heading with no own text become N.k", async () => {
    const src = "## 3 Non-billable work\n- Clerical tasks are not billable.\n- Internal conferences are not billable.\n  (continued explanation)\n- Training time shall not be billed.\n";
    const cs = await segmentRulebook("rb", src);
    expect(cs.map((c) => c.number)).toEqual(["3.1", "3.2", "3.3"]);
    expect(cs[1].text).toBe("Internal conferences are not billable.\n  (continued explanation)");
    exact(src, cs);
  });

  it("ALL-CAPS headings in an unnumbered document", async () => {
    const src = "ACME POLICY\nIntro text for the reader.\n\nTRAVEL\nTravel time must be billed at half rate.\n\nCLERICAL WORK\nClerical work is not billable.\n";
    const cs = await segmentRulebook("rb", src);
    expect(cs.map((c) => c.number)).toEqual(["1", "2"]);
    expect(cs.map((c) => c.title)).toEqual(["TRAVEL", "CLERICAL WORK"]);
    exact(src, cs);
  });

  it("1.1.1 headings and CRLF sources keep exact offsets", async () => {
    const src = "1.1 Fees\r\n1.1.1 Rates\r\nRates must be approved.\r\n1.1.2 Increments — Bill in tenths of an hour.\r\n";
    const cs = await segmentRulebook("rb", src);
    expect(cs.map((c) => c.number)).toEqual(["1.1.1", "1.1.2"]);
    exact(src, cs);
  });

  it("restarting '1.' lists under sections are prefixed", async () => {
    const src = "Section 1 Time\n1. Entries must be in tenths.\n2. Entries must describe one task.\nSection 2 Expenses\n1. Meals are not reimbursable.\n";
    const cs = await segmentRulebook("rb", src);
    expect(cs.map((c) => c.number)).toEqual(["1.1", "1.2", "2.1"]);
    exact(src, cs);
  });

  it("paragraph fallback numbers obligation paragraphs P1.. when the LLM fails", async () => {
    setLlmOverride(async () => {
      throw new Error("no llm");
    });
    const src = "Welcome to our guidelines.\n\nTimekeepers shall not bill more than ten hours per day.\n\nWe appreciate your partnership.\n\nTravel time will not be paid.\n";
    const cs = await segmentRulebook("rb", src);
    expect(cs.map((c) => c.number)).toEqual(["P1", "P2"]);
    exact(src, cs);
  });

  it("acme-style docs are unchanged", async () => {
    const src = fs.readFileSync(path.join(process.cwd(), "data", "acme-ocg.md"), "utf8");
    const cs = await segmentRulebook("rb_acme_ocg", src);
    expect(cs.map((c) => c.number)).toEqual(["3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7"]);
  });
});

describe("extractText", () => {
  it("reads .txt/.md and normalises CRLF, NBSP and zero-width chars", async () => {
    const raw = "﻿1.1 Rates\r\nRates must​ be approved.\r\n";
    const text = await extractText("g.txt", new TextEncoder().encode(raw));
    expect(text).toBe("1.1 Rates\nRates must be approved.\n");
    expect(normalizeText("a\r\nb")).toBe("a\nb\n");
  });

  it("detects types by magic bytes and rejects unknown binaries", async () => {
    expect(detectKind("x.bin", new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe("pdf");
    expect(detectKind("x.docx", new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe("docx");
    await expect(extractText("x.exe", new Uint8Array([0x4d, 0x5a, 0, 0, 1, 2]))).rejects.toBeInstanceOf(UnsupportedFileError);
  });
});

describe("LEDES 1998B", () => {
  const csv = [
    "id,date,timekeeperId,timekeeperName,role,hours,rate,amount,taskCode,activityCode,narrative,matterId",
    'te_01,2026-10-01,tk_a,Daniel Okafor,associate,2.5,620,1550,L120,A104,"Analyzed production",M-1',
    'te_02,2026-10-02,tk_b,Margaret Hale,partner,0.8,950,760,L120,A101,"Attention to file",M-1',
    'te_03,2026-10-03,tk_c,Rosa Diaz,paralegal,1,200,200,L140,A110,"Filed exhibits",M-1',
  ].join("\n");
  const ledes = [
    "LEDES1998B[]",
    "INVOICE_DATE|LAW_FIRM_MATTER_ID|LINE_ITEM_NUMBER|LINE_ITEM_NUMBER_OF_UNITS|LINE_ITEM_TOTAL|LINE_ITEM_DATE|LINE_ITEM_TASK_CODE|LINE_ITEM_ACTIVITY_CODE|TIMEKEEPER_ID|LINE_ITEM_DESCRIPTION|LINE_ITEM_UNIT_COST|TIMEKEEPER_NAME|TIMEKEEPER_CLASSIFICATION[]",
    "20261031|M-1|te_01|2.5|1550|20261001|L120|A104|tk_a|Analyzed production|620|Okafor, Daniel|AS[]",
    "20261031|M-1|te_02|0.8|760|20261002|L120|A101|tk_b|Attention to file|950|Hale, Margaret|PT[]",
    "20261031|M-1|te_03|1|200|20261003|L140|A110|tk_c|Filed exhibits|200|Rosa Diaz|PL[]",
  ].join("\r\n");

  it("parses to the same entries as the CSV equivalent", () => {
    expect(isLedes(ledes)).toBe(true);
    expect(parseLedes(ledes, "inv_x")).toEqual(parseInvoiceCsv(csv, "inv_x"));
    expect(parseInvoiceFile(ledes, "inv_x")).toEqual(parseInvoiceCsv(csv, "inv_x"));
    expect(parseInvoiceFile(csv, "inv_x")).toEqual(parseInvoiceCsv(csv, "inv_x"));
  });

  it("parses the Globex sample", () => {
    const text = fs.readFileSync(path.join(process.cwd(), "data", "samples", "invoice-globex.ledes"), "utf8");
    const es = parseInvoiceFile(text, "inv_g");
    expect(es).toHaveLength(8);
    expect(es[0]).toMatchObject({ date: "2026-10-05", timekeeperName: "Priya Patel", role: "associate", hours: 1.5, rate: 540, amount: 810, matterId: "GLOBEX-COM-0107" });
    expect(es.map((e) => e.role)).toContain("paralegal");
  });
});
