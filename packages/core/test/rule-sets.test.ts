import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli";
import { RULE_SETS, ruleSet, ruleSetInfo } from "../src/rules/index";
import { compileSchematron } from "../src/schematron";
import { type ValidationResult, validateInvoice } from "../src/validate";

const root = join(__dirname, "..");
const fixtures = join(__dirname, "fixtures");
const suite = join(fixtures, "xrechnung-testsuite/business-cases/standard");
const ubl = readFileSync(join(suite, "01.01a-INVOICE_ubl.xml"), "utf8");
const cii = readFileSync(join(suite, "01.01a-INVOICE_uncefact.xml"), "utf8");
const basicWl = readFileSync(join(fixtures, "pdf/validAvoir_FR_type380_BASICWL.pdf"));
// BR-TMP-6 exists in XRechnung Schematron 2.6.0 only: dates in UBL must be YYYY-MM-DD.
const oddDate = ubl.replace(/<cbc:IssueDate>[^<]*/, "<cbc:IssueDate>04.04.2016");

const applied = (r: ValidationResult) => r.ruleSets.map((s) => `${s.id}@${s.version}`);
/** Everything but the duration and the deprecation note. */
const comparable = (r: ValidationResult) => ({
  ...r,
  durationMs: 0,
  infos: r.infos.filter((i) => i.id !== "SUM-DEPRECATED"),
});

describe("ruleSetInfo with versions", () => {
  it("lists the default versions as before and every bundled version on request", () => {
    expect(ruleSetInfo().map((i) => `${i.id}@${i.version}`)).toEqual([
      "en16931-ubl@1.3.16",
      "en16931-cii@1.3.16",
      "xrechnung-ubl@2.6.0",
      "xrechnung-cii@2.6.0",
    ]);
    expect(ruleSetInfo({ versions: "all" }).map((i) => `${i.id}@${i.version}`)).toEqual([
      "en16931-ubl@1.3.16",
      "en16931-cii@1.3.16",
      "xrechnung-ubl@2.6.0",
      "xrechnung-cii@2.6.0",
      "xrechnung-ubl@2.5.0",
      "xrechnung-cii@2.5.0",
    ]);
  });

  it("looks up one version by version or release name", () => {
    const old = ruleSetInfo("xrechnung-ubl", "2.5.0");
    expect(old).toMatchObject({ version: "2.5.0", release: "v2.5.0", license: "Apache-2.0" });
    expect(ruleSetInfo("xrechnung-ubl", "v2.5.0")).toBe(old);
    expect(ruleSetInfo("xrechnung-ubl", "2.6.0")).toBe(RULE_SETS["xrechnung-ubl"]);
    expect(ruleSetInfo("xrechnung-ubl", "1.0.0")).toBeUndefined();
    expect(ruleSetInfo("en16931-ubl", "2.5.0")).toBeUndefined();
  });

  it("counts the rules of every bundled version", () => {
    for (const i of ruleSetInfo({ versions: "all" })) {
      const count = ruleSet(i.id, i.version).patterns.reduce(
        (n, p) => n + p.rules.reduce((m, r) => m + r.asserts.length, 0),
        0,
      );
      expect(i.rules, `${i.id}@${i.version}`).toBe(count);
    }
    expect(() => ruleSet("xrechnung-ubl", "0.1.0")).toThrow(/no bundled version/);
  });

  it("matches the vendored Schematron of the older XRechnung release", () => {
    for (const syntax of ["ubl", "cii"] as const) {
      const dir = join(root, "rules-src/xrechnung-2.5.0");
      const set = compileSchematron(
        readFileSync(join(dir, `XRechnung-${syntax.toUpperCase()}-validation.sch`), "utf8"),
        {
          id: `xrechnung-${syntax}`,
          includes: { "../common.sch": readFileSync(join(dir, "common.sch"), "utf8") },
        },
      );
      const bundled = ruleSet(`xrechnung-${syntax}`, "2.5.0");
      const tests = (s: typeof set) =>
        s.patterns.flatMap((p) => p.rules.flatMap((r) => r.asserts.map((a) => a.test)));
      expect(tests(bundled)).toEqual(tests(set));
    }
    const notice = readFileSync(join(root, "NOTICE.md"), "utf8");
    expect(notice).toContain("release v2.5.0");
    expect(readFileSync(join(root, "rules-src/xrechnung-2.5.0/LICENSE"), "utf8")).toContain(
      "Apache License",
    );
  });
});

describe("ruleSets option", () => {
  it('"auto" is the default and behaves as before', () => {
    expect(comparable(validateInvoice(ubl, { ruleSets: "auto" }))).toEqual(
      comparable(validateInvoice(ubl)),
    );
    expect(applied(validateInvoice(ubl))).toEqual(["en16931-ubl@1.3.16", "xrechnung-ubl@2.6.0"]);
    const plain = ubl.replace(
      /<cbc:CustomizationID>[^<]*</,
      "<cbc:CustomizationID>urn:cen.eu:en16931:2017<",
    );
    expect(applied(validateInvoice(plain))).toEqual(["en16931-ubl@1.3.16"]);
  });

  it("resolves a family by the syntax of the document", () => {
    const sets = { ruleSets: ["en16931", "xrechnung"] as ["en16931", "xrechnung"] };
    expect(applied(validateInvoice(ubl, sets))).toEqual([
      "en16931-ubl@1.3.16",
      "xrechnung-ubl@2.6.0",
    ]);
    expect(applied(validateInvoice(cii, sets))).toEqual([
      "en16931-cii@1.3.16",
      "xrechnung-cii@2.6.0",
    ]);
    expect(applied(validateInvoice(ubl, { ruleSets: ["en16931"] }))).toEqual([
      "en16931-ubl@1.3.16",
    ]);
  });

  it("applies exactly the listed rule sets, in order, and accepts syntax-specific ids as before", () => {
    expect(applied(validateInvoice(ubl, { ruleSets: ["xrechnung", "en16931"] }))).toEqual([
      "xrechnung-ubl@2.6.0",
      "en16931-ubl@1.3.16",
    ]);
    expect(applied(validateInvoice(ubl, { ruleSets: ["en16931-ubl"] }))).toEqual([
      "en16931-ubl@1.3.16",
    ]);
    expect(applied(validateInvoice(ubl, { ruleSets: [] }))).toEqual([]);
    expect(applied(validateInvoice(ubl, { ruleSets: ["en16931", "en16931@1.3.16"] }))).toEqual([
      "en16931-ubl@1.3.16",
    ]);
  });

  it("pins a bundled version, and the default version is the one without a suffix", () => {
    const pinned = validateInvoice(ubl, { ruleSets: ["en16931", "xrechnung@2.5.0"] });
    expect(applied(pinned)).toEqual(["en16931-ubl@1.3.16", "xrechnung-ubl@2.5.0"]);
    expect(pinned.ruleSets[1]).toBe(ruleSetInfo("xrechnung-ubl", "2.5.0"));
    expect(applied(validateInvoice(ubl, { ruleSets: ["xrechnung@v2.5.0"] }))).toEqual([
      "xrechnung-ubl@2.5.0",
    ]);
    expect(applied(validateInvoice(cii, { ruleSets: ["xrechnung-cii@2.5.0"] }))).toEqual([
      "xrechnung-cii@2.5.0",
    ]);
    expect(applied(validateInvoice(ubl, { ruleSets: ["xrechnung@2.6.0"] }))).toEqual([
      "xrechnung-ubl@2.6.0",
    ]);
  });

  it("gives different verdicts for different versions where the upstream rules differ", () => {
    const current = validateInvoice(oddDate, { schema: false });
    const older = validateInvoice(oddDate, {
      schema: false,
      ruleSets: ["en16931", "xrechnung@2.5.0"],
    });
    expect(current.warnings.map((w) => w.id)).toContain("BR-TMP-6");
    expect(older.warnings.map((w) => w.id)).not.toContain("BR-TMP-6");
  });

  it("accepts every reference invoice of the KoSIT test suite with the older XRechnung release", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const p = join(dir, f);
        return statSync(p).isDirectory() ? walk(p) : f.endsWith(".xml") ? [p] : [];
      });
    const files = walk(join(fixtures, "xrechnung-testsuite"));
    expect(files.length).toBeGreaterThan(40);
    const invalid = files
      .map((f) => ({
        f,
        r: validateInvoice(readFileSync(f), { ruleSets: ["en16931", "xrechnung@2.5.0"] }),
      }))
      .filter(({ r }) => !r.valid)
      .map(({ f, r }) => `${f}: ${r.errors.map((e) => e.id).join(", ")}`);
    expect(invalid).toEqual([]);
  });

  it("reports an unknown rule set or version as SUM-RULESET and runs nothing", () => {
    for (const ruleSets of [
      ["nope"],
      ["xrechnung@9.9.9"],
      ["en16931@"],
      ["xrechnung-ubl@1.3.16"],
    ]) {
      const r = validateInvoice(ubl, { ruleSets: ruleSets as never });
      expect(r.valid, ruleSets.join()).toBe(false);
      expect(r.errors.map((e) => e.id)).toEqual(["SUM-RULESET"]);
      expect(r.ruleSets).toEqual([]);
      expect(r.errors[0]?.ruleSet).toBe("summand");
    }
    const message = validateInvoice(ubl, { ruleSets: ["xrechnung@9.9.9"] }).errors[0]?.message;
    expect(message).toContain("2.6.0, 2.5.0");
    expect(
      validateInvoice(ubl, { ruleSets: ["nope" as never], lang: "de" }).errors[0]?.message,
    ).toMatch(/^Ungültige Angabe in ruleSets/);
  });
});

describe("deprecated option xrechnung", () => {
  it('is an alias for ruleSets: ["en16931", "xrechnung"] with identical results', () => {
    const inputs: Array<string | Uint8Array> = [
      ubl,
      cii,
      ubl.replace(/<cbc:CustomizationID>[^<]*</, "<cbc:CustomizationID>urn:cen.eu:en16931:2017<"),
      basicWl, // a profile that is not EN 16931 compliant: neither form applies a rule set
    ];
    for (const input of inputs) {
      const alias = validateInvoice(input, { xrechnung: true });
      const unified = validateInvoice(input, { ruleSets: ["en16931", "xrechnung"] });
      expect(comparable(alias)).toEqual(comparable(unified));
    }
  });

  it("changes nothing but adds an info with the id SUM-DEPRECATED", () => {
    const before = validateInvoice(ubl);
    const aliasFalse = validateInvoice(ubl, { xrechnung: false });
    expect(comparable(aliasFalse)).toEqual(comparable(before));
    for (const xrechnung of [true, false]) {
      const r = validateInvoice(ubl, { xrechnung });
      const notes = r.infos.filter((i) => i.id === "SUM-DEPRECATED");
      expect(notes).toHaveLength(1);
      // The format: it says it is deprecated, what to use, and when it goes away.
      expect(notes[0]?.message).toMatch(
        /^The option "xrechnung" is deprecated\. Use ruleSets: .+ It will be removed in 2\.0\.0\.$/,
      );
      expect(notes[0]).toMatchObject({ severity: "info", ruleSet: "summand" });
      // An info never makes an invoice invalid or turns into an exit code with --warnings-as-errors.
      expect(r.valid).toBe(true);
      expect(r.warnings).toEqual(before.warnings);
    }
    expect(validateInvoice(ubl, { xrechnung: true, lang: "de" }).infos[0]?.message).toMatch(
      /veraltet.*Verwenden Sie.*2\.0\.0 entfernt/,
    );
    expect(validateInvoice(ubl).infos.map((i) => i.id)).not.toContain("SUM-DEPRECATED");
    expect(validateInvoice(ubl, { ruleSets: ["en16931"] }).infos.map((i) => i.id)).not.toContain(
      "SUM-DEPRECATED",
    );
    // Also on results for inputs that are not invoices.
    expect(validateInvoice("<Order/>", { xrechnung: true }).infos.map((i) => i.id)).toEqual([
      "SUM-DEPRECATED",
    ]);
  });

  it("is deprecated in TSDoc with a replacement and the removal version", () => {
    const source = readFileSync(join(root, "src/validate.ts"), "utf8");
    const doc = /\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*xrechnung\?: boolean;/.exec(source)?.[1] ?? "";
    expect(doc).toMatch(/@deprecated Use `ruleSets`/);
    expect(doc).toMatch(/removed in 2\.0\.0/);
  });
});

describe("CLI --rule-sets", () => {
  const file = join(suite, "01.01a-INVOICE_ubl.xml");
  async function run(args: string[]) {
    const out: string[] = [];
    const err: string[] = [];
    const code = await runCli(args, { out: (l) => out.push(l), err: (l) => err.push(l) });
    return { code, out: out.join("\n"), err: err.join("\n") };
  }

  it("selects rule sets and versions", async () => {
    const r = await run(["validate", "--json", "--rule-sets", "en16931,xrechnung@2.5.0", file]);
    expect(r.code).toBe(0);
    expect(applied(JSON.parse(r.out))).toEqual(["en16931-ubl@1.3.16", "xrechnung-ubl@2.5.0"]);
    const auto = await run(["validate", "--json", "--rule-sets", "auto", file]);
    expect(applied(JSON.parse(auto.out))).toEqual(["en16931-ubl@1.3.16", "xrechnung-ubl@2.6.0"]);
  });

  it("is a usage error (2) for an unknown rule set or version", async () => {
    for (const value of ["xrechnung@9.9.9", "nope", ""]) {
      const r = await run(["validate", "--rule-sets", value, file]);
      expect(r.code, value).toBe(2);
      expect(r.err).toMatch(/^--rule-sets: /);
      expect(r.out).toBe("");
    }
  });

  it("--xrechnung still works, says on stderr that it is deprecated and leaves the exit code alone", async () => {
    const r = await run(["validate", "--xrechnung", file]);
    expect(r.code).toBe(0);
    expect(r.err).toBe(
      "Warning: --xrechnung is deprecated. Use --rule-sets en16931,xrechnung instead. It will be removed in 2.0.0.",
    );
    const strict = await run(["validate", "--xrechnung", "--warnings-as-errors", file]);
    expect(strict.code).toBe(0);
  });

  it("lists every bundled version with `summand rules`", async () => {
    const table = await run(["rules"]);
    expect(table.out).toMatch(
      /xrechnung-ubl +v2\.5\.0 +55 +Apache-2\.0 .* on request \(@2\.5\.0\)/,
    );
    expect(table.out).toMatch(/xrechnung-ubl +v2\.6\.0 +56 +Apache-2\.0 .* default/);
    expect(JSON.parse((await run(["rules", "--json"])).out)).toEqual(
      ruleSetInfo({ versions: "all" }),
    );
  });
});
