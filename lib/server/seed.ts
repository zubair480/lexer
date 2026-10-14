// B9 — demo seed. Wipes all tables, then seeds the Acme demo (client, rulebooks w/ clauses, invoices).
import fs from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import type { H1BPetition, Rule } from "@/shared/contract";
import { DEMO } from "@/shared/contract";
import { segmentRulebook } from "@/lib/compiler/segment";
import { parseInvoiceCsv } from "@/lib/server/csv";

const dataPath = (f: string) => path.join(process.cwd(), "data", f);
const readData = (f: string) => fs.readFileSync(dataPath(f), "utf8").replace(/\r\n/g, "\n");

export function loadPetitions(): H1BPetition[] {
  return JSON.parse(readData("petitions.json")) as H1BPetition[];
}

export function loadGolden(): Record<string, string[]> {
  return JSON.parse(readData("golden.json")) as Record<string, string[]>;
}

/** Hand-written reference DSL (offline fallback / tests): { rb_acme_ocg: Rule[], rb_uscis_h1b: Rule[] } */
export function loadReferenceRules(): Record<string, Rule[]> {
  return JSON.parse(readData("reference-rules.json")) as Record<string, Rule[]>;
}

export const USCIS_INVOICE_ID = "inv_uscis_petitions";

export async function seedDemo(prisma: PrismaClient): Promise<void> {
  // Wipe (children first).
  await prisma.flag.deleteMany();
  await prisma.timeEntry.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.rule.deleteMany();
  await prisma.clause.deleteMany();
  await prisma.rulebook.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.client.deleteMany();

  await prisma.client.create({ data: { id: DEMO.clientId, name: DEMO.clientName } });

  const books = [
    {
      id: DEMO.rulebookId,
      title: "Acme Corp Outside Counsel Billing Guidelines (synthetic)",
      recordType: "time_entry",
      file: "acme-ocg.md",
    },
    {
      id: DEMO.uscisRulebookId,
      title: "USCIS H-1B Filing Checklist (synthetic)",
      recordType: "h1b_petition",
      file: "uscis-h1b.md",
    },
  ];

  for (const b of books) {
    const sourceText = readData(b.file);
    await prisma.rulebook.create({
      data: { id: b.id, clientId: DEMO.clientId, title: b.title, recordType: b.recordType, sourceText },
    });
    const clauses = await segmentRulebook(b.id, sourceText);
    await prisma.clause.createMany({
      data: clauses.map((c, i) => ({
        id: c.id,
        rulebookId: b.id,
        number: c.number,
        title: c.title,
        text: c.text,
        start: c.start,
        end: c.end,
        ord: i,
      })),
    });
  }

  await prisma.invoice.create({
    data: { id: DEMO.invoiceId, clientId: DEMO.clientId, matterId: DEMO.matterId, period: "2026-10", recordType: "time_entry" },
  });
  const entries = parseInvoiceCsv(readData("invoice-oct.csv"), DEMO.invoiceId);
  await prisma.timeEntry.createMany({
    data: entries.map((e, i) => ({ ...e, ord: i })),
  });

  await prisma.invoice.create({
    data: { id: USCIS_INVOICE_ID, clientId: DEMO.clientId, matterId: "USCIS-H1B", period: "2026-10", recordType: "h1b_petition" },
  });
}
