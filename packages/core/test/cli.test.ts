import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli";

const fixtures = join(__dirname, "fixtures");
const valid = join(fixtures, "xrechnung-testsuite/business-cases/standard/01.01a-INVOICE_ubl.xml");
const pdf = join(fixtures, "pdf/EN16931_Einfach.pdf");

async function run(args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(args, { out: (l) => out.push(l), err: (l) => err.push(l) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

describe("cli", () => {
  it("validates files and sets the exit code", async () => {
    const ok = await run(["validate", valid, pdf]);
    expect(ok.code).toBe(0);
    expect(ok.out).toMatch(/^valid {3}.*XRechnung 3\.0/m);
    const bad = await run(["validate", join(fixtures, "pdf/zugferd_invoice.pdf")]);
    expect(bad.code).toBe(1);
    expect(bad.out).toContain("SUM-FORMAT");
  });

  it("prints German output with --lang de", async () => {
    const ok = await run(["validate", "--lang", "de", valid]);
    expect(ok.out).toMatch(/^gültig {3}.*0 Fehler, 0 Warnung\(en\)/m);
    const bad = await run(["validate", "--lang", "fr", valid]);
    expect(bad.code).toBe(2);
    expect(bad.err).toContain("--lang de");
  });

  it("prints JSON lines", async () => {
    const r = await run(["validate", "--json", valid]);
    expect(JSON.parse(r.out)).toMatchObject({ valid: true, profile: { id: "xrechnung" } });
  });

  it("reports schema errors and skips them with --no-schema", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "summand-")), "invoice.xml");
    writeFileSync(
      file,
      readFileSync(valid, "utf8").replace(
        "<cbc:IssueDate>2016-04-04<",
        "<cbc:IssueDate>04.04.2016<",
      ),
    );
    const checked = await run(["validate", file]);
    expect(checked.code).toBe(1);
    expect(checked.out).toContain("SUM-XSD (line 8)");
    const skipped = await run(["validate", "--no-schema", file]);
    expect(skipped.out).not.toContain("SUM-XSD");
  });

  it("extracts the XML from a PDF", async () => {
    const out = join(mkdtempSync(join(tmpdir(), "summand-")), "invoice.xml");
    expect((await run(["extract", pdf, "--out", out])).code).toBe(0);
    expect(readFileSync(out, "utf8")).toContain("CrossIndustryInvoice");
  });

  it("checks Leitweg-IDs", async () => {
    expect((await run(["leitweg", "04011000-1234512345-06"])).code).toBe(0);
    const wrong = await run(["leitweg", "04011000-1234512345-07"]);
    expect(wrong.code).toBe(1);
    expect(wrong.out).toContain("expected 06");
  });

  it("skips the Leitweg-ID check with --no-leitweg", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "summand-")), "invoice.xml");
    writeFileSync(
      file,
      readFileSync(valid, "utf8").replace(
        /<cbc:BuyerReference>[^<]*</,
        "<cbc:BuyerReference>04011000-12345-34<",
      ),
    );
    expect((await run(["validate", file])).out).toContain("SUM-LEITWEG");
    expect((await run(["validate", "--no-leitweg", file])).out).not.toContain("SUM-LEITWEG");
  });

  it("prints the version", async () => {
    const version = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf8")).version;
    for (const flag of ["--version", "-v", "version"]) {
      const r = await run([flag]);
      expect(r.code).toBe(0);
      expect(r.out).toBe(version);
    }
  });

  it("shows help", async () => {
    expect((await run(["--help"])).out).toContain("summand validate");
    expect((await run([])).code).toBe(2);
  });

  it("separates findings (1) from errors running the command (2)", async () => {
    // not an invoice at all: a finding
    const notInvoice = await run(["validate", join(fixtures, "pdf/zugferd_invoice.pdf")]);
    expect(notInvoice.code).toBe(1);
    // unreadable path, unknown flag, missing files, unknown command: the command could not run
    const missing = await run(["validate", join(fixtures, "does-not-exist.xml")]);
    expect(missing.code).toBe(2);
    expect(missing.err).toContain("ENOENT");
    expect((await run(["validate", "--nope", valid])).code).toBe(2);
    expect((await run(["validate"])).code).toBe(2);
    expect((await run(["nonsense"])).code).toBe(2);
    expect((await run([])).code).toBe(2);
    expect((await run(["extract"])).code).toBe(2);
    expect((await run(["extract", valid])).code).toBe(2);
    expect((await run(["leitweg"])).code).toBe(2);
    expect((await run(["rules", "--fail-on-outdated"])).code).toBe(2);
    // an error wins over findings, and the other files are still validated
    const both = await run(["validate", join(fixtures, "nope.xml"), valid]);
    expect(both.code).toBe(2);
    expect(both.out).toMatch(/^valid {3}/m);
    // leitweg: a wrong ID is a finding
    expect((await run(["leitweg", "not-an-id"])).code).toBe(1);
  });

  it("counts warnings as findings with --warnings-as-errors", async () => {
    const withWarning = join(
      fixtures,
      "xrechnung-testsuite/business-cases/standard/01.06a-INVOICE_ubl.xml",
    );
    expect((await run(["validate", withWarning])).code).toBe(0);
    expect((await run(["validate", "--warnings-as-errors", withWarning])).code).toBe(1);
    expect((await run(["validate", "--warnings-as-errors", valid])).code).toBe(0);
  });
});
