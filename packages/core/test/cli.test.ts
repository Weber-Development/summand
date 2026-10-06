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

  it("shows help", async () => {
    expect((await run(["--help"])).out).toContain("summand validate");
    expect((await run([])).code).toBe(1);
  });
});
