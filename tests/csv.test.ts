import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseInvoiceCsv } from "@/lib/server/csv";

describe("parseInvoiceCsv", () => {
  it("parses data/invoice-oct.csv into 20 entries with amount == hours x rate", () => {
    const csv = fs.readFileSync(path.join(process.cwd(), "data", "invoice-oct.csv"), "utf8");
    const entries = parseInvoiceCsv(csv, "inv_test");
    expect(entries).toHaveLength(20);
    for (const e of entries) {
      expect(e.invoiceId).toBe("inv_test");
      expect(typeof e.hours).toBe("number");
      expect(typeof e.rate).toBe("number");
      expect(e.amount).toBeCloseTo(Math.round(e.hours * e.rate * 100) / 100, 2);
      expect(["partner", "associate", "paralegal"]).toContain(e.role);
      expect(e.narrative.length).toBeGreaterThan(0);
    }
    expect(new Set(entries.map((e) => e.id)).size).toBe(20);
  });

  it("computes amount from hours x rate when the column is absent, lowercases role, trims", () => {
    const csv = [
      "date,timekeeperId,timekeeperName,role,hours,rate,taskCode,activityCode,narrative,matterId",
      " 2026-10-01 ,tk1,Jane Doe, Partner ,1.5,333.33,L120,A101, Draft motion ,M1",
      "",
    ].join("\n");
    const [e] = parseInvoiceCsv(csv, "inv_x");
    expect(e.role).toBe("partner");
    expect(e.date).toBe("2026-10-01");
    expect(e.narrative).toBe("Draft motion");
    expect(e.amount).toBe(500);
  });

  it("throws a clear error when required columns are missing", () => {
    expect(() => parseInvoiceCsv("date,hours\n2026-10-01,1", "inv_x")).toThrow(/missing required column/i);
  });
});
