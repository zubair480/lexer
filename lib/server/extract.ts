// G2 — text extraction for uploaded guideline documents (.md/.txt/.pdf/.docx/.html).
// The normalised text returned here becomes Rulebook.sourceText, so clause offsets stay valid.

export class UnsupportedFileError extends Error {
  status = 415;
}

export type FileKind = "text" | "pdf" | "docx" | "html" | "unknown";

const TEXT_EXT = new Set(["md", "markdown", "txt", "text", "rtf", "csv", "ledes", "tsv", "json"]);

export function detectKind(filename: string, buf: Uint8Array): FileKind {
  // magic bytes first
  if (buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return "pdf"; // %PDF
  const ext = (filename.split(".").pop() || "").toLowerCase();
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    // zip container: docx (we do not support xlsx/pptx/odt)
    return ext === "docx" || ext === "docm" || ext === "dotx" || ext === "" ? "docx" : "unknown";
  }
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "html" || ext === "htm") return "html";
  if (TEXT_EXT.has(ext)) return "text";
  // no/unknown extension: accept if it decodes as mostly printable text
  if (looksLikeText(buf)) return "text";
  return "unknown";
}

function looksLikeText(buf: Uint8Array): boolean {
  const n = Math.min(buf.length, 4096);
  if (n === 0) return true;
  let bad = 0;
  for (let i = 0; i < n; i++) {
    const b = buf[i];
    if (b === 0) return false;
    if (b < 9 || (b > 13 && b < 32)) bad++;
  }
  return bad / n < 0.02;
}

/** Normalise once: BOM, CRLF/CR→LF, NBSP & exotic spaces→space, strip zero-width chars, trim trailing spaces per line. */
export function normalizeText(s: string): string {
  return s
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[    - 　]/g, " ")
    .replace(/[​-‍⁠﻿­]/g, "")
    .replace(/\f/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim() + "\n";
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function missing(name: string, e: unknown): Error {
  return new Error(`Server is missing the "${name}" package needed to read this file type (${(e as Error)?.message ?? e})`);
}

async function pdfText(buf: Uint8Array): Promise<string> {
  let m: typeof import("unpdf");
  try {
    m = await import("unpdf");
  } catch (e) {
    throw missing("unpdf", e);
  }
  const pdf = await m.getDocumentProxy(new Uint8Array(buf));
  const { text } = await m.extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n\n") : (text as string);
}

async function docxText(buf: Uint8Array): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let m: any;
  try {
    m = await import("mammoth");
  } catch (e) {
    throw missing("mammoth", e);
  }
  const fn = m.extractRawText ?? m.default?.extractRawText;
  if (!fn) throw new Error("mammoth.extractRawText not available");
  const out = await fn({ buffer: Buffer.from(buf) });
  return String(out.value ?? "");
}

/** Extract + normalise text from an uploaded file. Throws UnsupportedFileError (415) for unknown types. */
export async function extractText(filename: string, input: Uint8Array | ArrayBuffer | Buffer): Promise<string> {
  const buf = input instanceof Uint8Array ? input : new Uint8Array(input);
  const kind = detectKind(filename || "", buf);
  let raw: string;
  switch (kind) {
    case "pdf":
      raw = await pdfText(buf);
      break;
    case "docx":
      raw = await docxText(buf);
      break;
    case "html":
      raw = htmlToText(new TextDecoder("utf-8").decode(buf));
      break;
    case "text":
      raw = new TextDecoder("utf-8").decode(buf);
      break;
    default:
      throw new UnsupportedFileError(
        `Unsupported file type "${filename}". Upload .md, .txt, .pdf, .docx or .html.`,
      );
  }
  return normalizeText(raw);
}
