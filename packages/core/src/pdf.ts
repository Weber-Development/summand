/**
 * Finds the invoice XML embedded in a ZUGFeRD / Factur-X PDF (PDF/A-3 with an associated file).
 * Embedded files are always stored as top-level stream objects, so scanning the stream objects
 * is enough; object streams and cross-reference streams do not need to be parsed.
 */
import { inflateZlib } from "./inflate";

/** A file embedded in a PDF (a PDF/A-3 associated file). */
export interface EmbeddedFile {
  /** File name from the file specification, when it could be found. */
  name?: string;
  /** MIME type from /Subtype, e.g. "text/xml". */
  mimeType?: string;
  /** The decoded file contents. */
  data: Uint8Array;
}

/** What {@link readPdf} found in a PDF. */
export interface PdfInfo {
  /** Embedded files, in the order they appear in the PDF. */
  files: EmbeddedFile[];
  /** Factur-X / ZUGFeRD conformance level declared in the XMP metadata (e.g. "EN 16931"). */
  xmpConformanceLevel?: string;
  /** Document file name declared in the XMP metadata (e.g. "factur-x.xml"). */
  xmpDocumentFileName?: string;
  /** True when the PDF is encrypted; embedded files cannot be read then. */
  encrypted: boolean;
}

/** Thrown by {@link readPdf} and {@link extractInvoiceXml} when a PDF cannot be read. */
export class PdfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfError";
  }
}

const decoder = new TextDecoder("latin1");

/** True when the bytes start like a PDF (`%PDF-` within the first kilobyte). */
export function isPdf(bytes: Uint8Array): boolean {
  // %PDF- may follow a few bytes of junk; readers accept it within the first kilobyte.
  const head = decoder.decode(bytes.subarray(0, Math.min(1024, bytes.length)));
  return head.includes("%PDF-");
}

function unescapePdfName(name: string): string {
  return name.replace(/#([0-9a-fA-F]{2})/g, (_m, h: string) =>
    String.fromCharCode(Number.parseInt(h, 16)),
  );
}

function pdfStringValue(raw: string): string {
  // Literal string (...) with escapes, or hex string <...>.
  if (raw.startsWith("<")) {
    const hex = raw.slice(1, -1).replace(/\s+/g, "");
    let out = "";
    for (let i = 0; i < hex.length; i += 2)
      out += String.fromCharCode(Number.parseInt(hex.slice(i, i + 2).padEnd(2, "0"), 16));
    return decodeTextString(out);
  }
  const body = raw.slice(1, -1).replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_m, e: string) => {
    switch (e) {
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      case "b":
        return "\b";
      case "f":
        return "\f";
      case "(":
      case ")":
      case "\\":
        return e;
      default:
        return String.fromCharCode(Number.parseInt(e, 8));
    }
  });
  return decodeTextString(body);
}

function decodeTextString(s: string): string {
  if (s.charCodeAt(0) === 0xfe && s.charCodeAt(1) === 0xff) {
    let out = "";
    for (let i = 2; i + 1 < s.length; i += 2)
      out += String.fromCharCode((s.charCodeAt(i) << 8) | s.charCodeAt(i + 1));
    return out;
  }
  return s;
}

interface RawObject {
  id: string;
  dict: string;
  start: number;
  end: number;
}

function findStreamObjects(text: string): RawObject[] {
  const out: RawObject[] = [];
  const re = /(\d+)\s+(\d+)\s+obj\b/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const objStart = m.index + m[0].length;
    const endobj = text.indexOf("endobj", objStart);
    // The stream keyword follows the dictionary's closing ">>" (names like /octet-stream do not count).
    const keyword = />>\s*stream(?=\r?\n|\r)/g;
    keyword.lastIndex = objStart;
    const k = keyword.exec(text);
    if (!k || (endobj !== -1 && k.index > endobj)) continue;
    const streamAt = k.index + k[0].length - 6;
    const dict = text.slice(objStart, streamAt);
    if (!dict.includes("<<")) continue;
    let dataStart = streamAt + 6;
    if (text[dataStart] === "\r") dataStart++;
    if (text[dataStart] === "\n") dataStart++;
    let dataEnd = -1;
    const length = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
    if (length) {
      const candidate = dataStart + Number(length[1]);
      const after = text.slice(candidate, candidate + 20);
      if (/^\s*endstream/.test(after)) dataEnd = candidate;
    }
    if (dataEnd === -1) {
      const es = text.indexOf("endstream", dataStart);
      if (es === -1) continue;
      dataEnd = es;
      // Strip the end-of-line marker before "endstream".
      if (text[dataEnd - 1] === "\n") dataEnd--;
      if (text[dataEnd - 1] === "\r") dataEnd--;
    }
    out.push({ id: `${m[1]} ${m[2]}`, dict, start: dataStart, end: dataEnd });
    re.lastIndex = dataEnd;
  }
  return out;
}

function decodeStream(bytes: Uint8Array, obj: RawObject): Uint8Array {
  const raw = bytes.subarray(obj.start, obj.end);
  const filters = /\/Filter\s*(\[[^\]]*\]|\/[A-Za-z0-9]+)/.exec(obj.dict)?.[1] ?? "";
  const names = filters.match(/\/[A-Za-z0-9]+/g) ?? [];
  let data = raw;
  for (const f of names) {
    if (f === "/FlateDecode" || f === "/Fl") {
      data = inflateZlib(data, 64 * 1024 * 1024);
    } else if (f === "/ASCIIHexDecode" || f === "/AHx") {
      const hex = decoder.decode(data).replace(/[^0-9a-fA-F]/g, "");
      const out = new Uint8Array(Math.ceil(hex.length / 2));
      for (let i = 0; i < out.length; i++)
        out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2).padEnd(2, "0"), 16);
      data = out;
    } else {
      throw new PdfError(`Unsupported stream filter ${f}`);
    }
  }
  return data;
}

/**
 * Lists the embedded files of a PDF and the Factur-X information from its XMP metadata.
 *
 * @throws {@link PdfError} when the PDF cannot be read.
 */
export function readPdf(bytes: Uint8Array): PdfInfo {
  if (!isPdf(bytes)) throw new PdfError("Not a PDF file");
  const text = decoder.decode(bytes);
  const encrypted = /\/Encrypt\s+(\d+\s+\d+\s+R|<<)/.test(text);
  const streams = findStreamObjects(text);
  const info: PdfInfo = { files: [], encrypted };

  // Index the non-stream objects (top level and inside object streams) so the file specifications
  // can be resolved: Filespec (/UF, /F name) → /EF dictionary → embedded file stream.
  const objects = new Map<string, string>();
  const topRe = /(\d+)\s+(\d+)\s+obj\b([\s\S]*?)\bendobj\b/g;
  const streamIds = new Set(streams.map((x) => x.id));
  for (let m = topRe.exec(text); m; m = topRe.exec(text)) {
    const id = `${m[1]} ${m[2]}`;
    if (streamIds.has(id)) {
      // Skip the binary data; continue after the stream.
      const st = streams.find((x) => x.id === id);
      if (st) topRe.lastIndex = Math.max(topRe.lastIndex, st.end);
      continue;
    }
    objects.set(id, m[3] as string);
  }
  for (const st of streams) {
    if (!/\/Type\s*\/ObjStm/.test(st.dict)) continue;
    try {
      const content = decoder.decode(decodeStream(bytes, st));
      const first = Number(/\/First\s+(\d+)/.exec(st.dict)?.[1] ?? Number.NaN);
      const count = Number(/\/N\s+(\d+)/.exec(st.dict)?.[1] ?? Number.NaN);
      if (!Number.isFinite(first) || !Number.isFinite(count)) continue;
      const header = content.slice(0, first).trim().split(/\s+/).map(Number);
      for (let i = 0; i < count; i++) {
        const num = header[i * 2];
        const offset = header[i * 2 + 1];
        const nextOffset = i + 1 < count ? header[i * 2 + 3] : undefined;
        if (num === undefined || offset === undefined) continue;
        objects.set(
          `${num} 0`,
          content.slice(first + offset, nextOffset === undefined ? undefined : first + nextOffset),
        );
      }
    } catch {
      // ignore unreadable object streams
    }
  }
  const names = new Map<string, string>();
  const stringRe = "(\\((?:\\\\.|[^\\\\)])*\\)|<[0-9a-fA-F\\s]*>)";
  for (const body of objects.values()) {
    if (!body.includes("/EF")) continue;
    const nameMatch =
      new RegExp(`/UF\\s*${stringRe}`).exec(body) ?? new RegExp(`/F\\s*${stringRe}`).exec(body);
    let ef = /\/EF\s*<<([\s\S]*?)>>/.exec(body)?.[1];
    if (ef === undefined) {
      const ref = /\/EF\s+(\d+)\s+(\d+)\s+R/.exec(body);
      if (ref) ef = objects.get(`${ref[1]} ${ref[2]}`);
    }
    const target = ef ? /\/(?:UF|F)\s+(\d+)\s+(\d+)\s+R/.exec(ef) : null;
    if (target && nameMatch?.[1])
      names.set(`${target[1]} ${target[2]}`, pdfStringValue(nameMatch[1]));
  }

  for (const s of streams) {
    const isEmbedded = /\/Type\s*\/EmbeddedFile\b/.test(s.dict);
    const isMetadata = /\/Type\s*\/Metadata\b/.test(s.dict) && /\/Subtype\s*\/XML\b/.test(s.dict);
    if (!isEmbedded && !isMetadata) continue;
    let data: Uint8Array;
    try {
      data = decodeStream(bytes, s);
    } catch {
      continue;
    }
    if (isMetadata) {
      const xmp = new TextDecoder("utf-8").decode(data);
      const level = /ConformanceLevel(?:>|\s*=\s*["'])\s*([^<"']+)/.exec(xmp)?.[1]?.trim();
      const fileName = /DocumentFileName(?:>|\s*=\s*["'])\s*([^<"']+)/.exec(xmp)?.[1]?.trim();
      if (level) info.xmpConformanceLevel = level;
      if (fileName) info.xmpDocumentFileName = fileName;
      continue;
    }
    const subtype = /\/Subtype\s*\/([^\s/<>[\]]+)/.exec(s.dict)?.[1];
    const file: EmbeddedFile = { data };
    const name = names.get(s.id);
    if (name) file.name = name;
    if (subtype) file.mimeType = unescapePdfName(subtype);
    info.files.push(file);
  }
  return info;
}

const INVOICE_NAMES = [
  "factur-x.xml",
  "zugferd-invoice.xml",
  "xrechnung.xml",
  "zugferd_invoice.xml",
];

/**
 * Returns the invoice XML embedded in a ZUGFeRD / Factur-X PDF, or undefined when the PDF has no
 * embedded invoice.
 *
 * @throws {@link PdfError} when the PDF cannot be read.
 */
export function extractInvoiceXml(
  bytes: Uint8Array,
): { xml: string; name?: string; info: PdfInfo } | undefined {
  const info = readPdf(bytes);
  const utf8 = new TextDecoder("utf-8");
  const candidates = info.files
    .map((f) => ({ f, text: utf8.decode(f.data) }))
    .filter(({ text }) =>
      /<(?:[\w-]+:)?(?:CrossIndustryInvoice|CrossIndustryDocument|Invoice|CreditNote)[\s>]/.test(
        text,
      ),
    );
  if (candidates.length === 0) return undefined;
  const preferred =
    candidates.find(({ f }) => f.name && INVOICE_NAMES.includes(f.name.toLowerCase())) ??
    candidates.find(({ f }) => f.name && f.name === info.xmpDocumentFileName) ??
    candidates[0];
  if (!preferred) return undefined;
  return { xml: preferred.text, ...(preferred.f.name ? { name: preferred.f.name } : {}), info };
}
