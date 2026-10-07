/**
 * The error code catalogue (docs/reference/error-codes.md) is part of the public contract:
 * every SUM- code the package can emit is documented there with severity, meaning, cause and fix,
 * every documented code is really emitted with the documented severity, and the exit codes of the
 * CLI are listed.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli";
import { EXIT_CODES } from "../src/exit-codes";
import { extractInvoiceXml, type ValidationMessage, validateInvoice } from "../src/index";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalogue = readFileSync(join(root, "../../docs/reference/error-codes.md"), "utf8");
const fixtures = join(root, "test/fixtures");
const pdf = (name: string) => new Uint8Array(readFileSync(join(fixtures, "pdf", name)));
const ubl = readFileSync(
  join(fixtures, "xrechnung-testsuite/business-cases/standard/01.01a-INVOICE_ubl.xml"),
  "utf8",
);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory())
      return name === "rules" || name === "schemas" ? [] : sourceFiles(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}

/** Every SUM- code that appears in the source (the compiled rule sets contain none). */
function emittedInSource(): string[] {
  const codes = new Set<string>();
  for (const file of sourceFiles(join(root, "src"))) {
    for (const m of readFileSync(file, "utf8").matchAll(/SUM-[A-Z0-9]+(?:-[A-Z0-9]+)*/g))
      codes.add(m[0]);
  }
  return [...codes].sort();
}

/** Code → severities, from the table at the top of the catalogue. */
function documentedSeverities(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const m of catalogue.matchAll(/^\| \[`(SUM-[A-Z0-9-]+)`\]\([^)]*\) \| ([^|]+) \|/gm))
    out.set(m[1] as string, (m[2] as string).trim().split(" or "));
  return out;
}

function documentedSections(): string[] {
  return [...catalogue.matchAll(/^### (SUM-[A-Z0-9-]+)$/gm)].map((m) => m[1] as string).sort();
}

/** A minimal PDF with embedded invoice XML and XMP metadata that names another profile. */
function pdfWithXmp(level: string): Uint8Array {
  const xml = extractInvoiceXml(pdf("EN16931_Einfach.pdf"))?.xml ?? "";
  const xmp = `<x:xmpmeta><fx:ConformanceLevel>${level}</fx:ConformanceLevel></x:xmpmeta>`;
  const text = [
    "%PDF-1.7",
    `1 0 obj\n<< /Type /Metadata /Subtype /XML /Length ${xmp.length} >>\nstream\n${xmp}\nendstream\nendobj`,
    `2 0 obj\n<< /Type /EmbeddedFile /Subtype /text#2Fxml /Length ${Buffer.byteLength(xml)} >>\nstream\n${xml}\nendstream\nendobj`,
    "3 0 obj\n<< /Type /Filespec /F (factur-x.xml) /UF (factur-x.xml) /EF << /F 2 0 R /UF 2 0 R >> >>\nendobj",
    "%%EOF",
  ].join("\n");
  return new Uint8Array(Buffer.from(text, "utf8"));
}

/** One input per documented behaviour; `severity` is what the catalogue promises for it. */
const scenarios: Array<{ code: string; severity: string; run: () => ValidationMessage[] }> = [
  {
    code: "SUM-XML",
    severity: "error",
    run: () => validateInvoice("<Invoice><unclosed></Invoice>").errors,
  },
  { code: "SUM-FORMAT", severity: "error", run: () => validateInvoice("<Order/>").errors },
  {
    code: "SUM-FORMAT",
    severity: "error",
    run: () => validateInvoice(pdf("zugferd_invoice.pdf")).errors,
  },
  {
    code: "SUM-PDF",
    severity: "error",
    run: () => validateInvoice(pdf("MustangGnuaccountingBeispielRE-20201121_508blanko.pdf")).errors,
  },
  {
    code: "SUM-XSD",
    severity: "error",
    run: () => validateInvoice(ubl.replace("</cbc:ID>", "</cbc:ID><cbc:Unknown/>")).errors,
  },
  {
    code: "SUM-PROFILE",
    severity: "error",
    run: () => validateInvoice(pdf("validAvoir_FR_type380_BASICWL.pdf")).errors,
  },
  {
    code: "SUM-PROFILE",
    severity: "warning",
    run: () =>
      validateInvoice(
        ubl.replace(/<cbc:CustomizationID>[^<]*</, "<cbc:CustomizationID>urn:example:unknown<"),
      ).warnings,
  },
  {
    code: "SUM-EXTENDED",
    severity: "info",
    run: () => validateInvoice(pdf("EXTENDED_Fremdwaehrung_wdis_fx-pdfa4.pdf")).infos,
  },
  {
    code: "SUM-LEITWEG",
    severity: "warning",
    run: () =>
      validateInvoice(
        ubl.replace(/<cbc:BuyerReference>[^<]*</, "<cbc:BuyerReference>04011000-12345-34<"),
      ).warnings,
  },
  {
    code: "SUM-PDF-LEVEL",
    severity: "warning",
    run: () => validateInvoice(pdfWithXmp("BASIC")).warnings,
  },
];

describe("error code catalogue", () => {
  it("documents every SUM- code the source can emit, and nothing else", () => {
    const documented = [...documentedSeverities().keys()].sort();
    expect(documented, "codes in the table of docs/reference/error-codes.md").toEqual(
      emittedInSource(),
    );
    expect(documentedSections(), "### headings in docs/reference/error-codes.md").toEqual(
      emittedInSource(),
    );
  });

  it("gives every code a meaning, cause and fix", () => {
    for (const code of emittedInSource()) {
      const start = catalogue.indexOf(`\n### ${code}\n`);
      expect(start, code).toBeGreaterThan(-1);
      const next = catalogue.indexOf("\n#", start + 1);
      const body = catalogue.slice(start, next === -1 ? undefined : next);
      expect(body, `${code} severity`).toMatch(/Severity: /);
      expect(body, `${code} meaning`).toMatch(/\*\*Meaning/);
      if (code !== "SUM-EXTENDED") expect(body, `${code} cause`).toMatch(/\*\*Causes/);
      expect(body, `${code} fix`).toMatch(/\*\*Fix/);
    }
  });

  it("emits every documented code with the documented severity", () => {
    const observed = new Map<string, Set<string>>();
    for (const s of scenarios) {
      const found = s.run().filter((m) => m.id === s.code);
      expect(found.length, `${s.code} (${s.severity})`).toBeGreaterThan(0);
      for (const m of found) {
        expect(m.severity, s.code).toBe(s.severity);
        expect(m.ruleSet, s.code).toBe("summand");
      }
      observed.set(s.code, (observed.get(s.code) ?? new Set()).add(s.severity));
    }
    for (const [code, severities] of documentedSeverities())
      expect([...(observed.get(code) ?? [])].sort(), code).toEqual([...severities].sort());
  });

  it("reports the same codes in German", () => {
    const de = validateInvoice("<Order/>", { lang: "de" });
    expect(de.errors[0]?.id).toBe("SUM-FORMAT");
  });
});

describe("exit codes", () => {
  const table = catalogue.slice(catalogue.indexOf("## Exit codes of the summand command"));
  const documented = [...table.matchAll(/^\| (\d+) \|/gm)].map((m) => Number(m[1])).sort();

  it("documents exactly the exit codes the CLI defines", () => {
    expect(documented).toEqual(Object.values(EXIT_CODES).sort());
  });

  it("returns only documented exit codes", async () => {
    const run = async (args: string[]) =>
      runCli(
        args,
        { out: () => {}, err: () => {} },
        { fetch: async () => ({ ok: false, status: 500, json: async () => ({}) }) },
      );
    const file = join(
      fixtures,
      "xrechnung-testsuite/business-cases/standard/01.01a-INVOICE_ubl.xml",
    );
    const codes = [
      await run(["validate", file]),
      await run(["validate", "--lang", "fr", file]),
      await run(["validate", join(fixtures, "pdf/zugferd_invoice.pdf")]),
      await run(["nonsense"]),
      await run([]),
      await run(["--help"]),
      await run(["--version"]),
      await run(["rules", "--check", "--fail-on-outdated"]),
    ];
    for (const code of codes) expect(documented).toContain(code);
    expect(codes).toEqual([0, 2, 1, 2, 2, 0, 0, 0]);
  });
});
