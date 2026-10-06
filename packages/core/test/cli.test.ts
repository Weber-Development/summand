import { mkdtempSync, readFileSync } from "node:fs";
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
    expect(bad.code).toBe(1);
    expect(bad.err).toContain("--lang de");
  });

  it("prints JSON lines", async () => {
    const r = await run(["validate", "--json", valid]);
    expect(JSON.parse(r.out)).toMatchObject({ valid: true, profile: { id: "xrechnung" } });
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
