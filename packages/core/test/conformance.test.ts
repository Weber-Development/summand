/**
 * Conformance against official test material: the CEN EN 16931 unit tests (each test names the
 * rule that must or must not fire) and the KoSIT XRechnung test suite (all invoices are valid).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ruleSet } from "../src/rules/index";
import { runSchematron } from "../src/schematron";
import { validateInvoice } from "../src/validate";
import { parseXml, type XNode } from "../src/xml";

const fixtures = join(__dirname, "fixtures");

function unitCases(dir: string) {
  const cases: Array<{ name: string; doc: XNode; expect: Array<{ kind: string; id: string }> }> =
    [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".xml"))) {
    const testSet = parseXml(readFileSync(join(dir, file), "utf8")).children.find(
      (c) => c.kind === "element",
    );
    const tests = testSet?.children.filter((c) => c.kind === "element" && c.local === "test") ?? [];
    tests.forEach((test, i) => {
      const assertEl = test.children.find((c) => c.kind === "element" && c.local === "assert");
      const expectations = (assertEl?.children ?? [])
        .filter(
          (c) => c.kind === "element" && ["success", "error", "warning", "fatal"].includes(c.local),
        )
        .map((c) => ({
          kind: c.local,
          id: c.children
            .map((x) => x.value)
            .join("")
            .trim(),
        }));
      const invoice = test.children.find(
        (c) => c.kind === "element" && c.local !== "assert",
      ) as XNode;
      const doc: XNode = {
        ...invoice,
        kind: "document",
        ns: "",
        local: "",
        prefix: "",
        value: "",
        parent: null,
        children: [invoice],
        attributes: [],
        namespaces: null,
        order: -1,
        line: 1,
      };
      invoice.parent = doc;
      cases.push({ name: `${file}#${i + 1}`, doc, expect: expectations });
    });
  }
  return cases;
}

describe("EN 16931 unit tests (CEN)", () => {
  for (const [dir, set] of [
    ["Invoice-unit-UBL", "en16931-ubl"],
    ["CreditNote-unit-UBL", "en16931-ubl"],
    ["cii", "en16931-cii"],
  ] as const) {
    it(`${dir}: every expected rule fires and no unexpected one`, () => {
      const failures: string[] = [];
      let checked = 0;
      for (const c of unitCases(join(fixtures, "en16931-unit", dir))) {
        const fired = new Set(runSchematron(ruleSet(set), c.doc).map((f) => f.id));
        for (const e of c.expect) {
          checked++;
          const ok = e.kind === "success" ? !fired.has(e.id) : fired.has(e.id);
          if (!ok) failures.push(`${c.name}: expected ${e.kind} ${e.id}`);
        }
      }
      expect(failures).toEqual([]);
      expect(checked).toBeGreaterThan(0);
    });
  }
});

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : f.endsWith(".xml") ? [p] : [];
  });
}

describe("XRechnung test suite (KoSIT)", () => {
  it("accepts every reference invoice", () => {
    const files = walk(join(fixtures, "xrechnung-testsuite"));
    expect(files.length).toBeGreaterThan(40);
    const invalid = files
      .map((f) => ({ f, r: validateInvoice(readFileSync(f)) }))
      .filter(({ r }) => !r.valid)
      .map(({ f, r }) => `${f}: ${r.errors.map((e) => e.id).join(", ")}`);
    expect(invalid).toEqual([]);
  });
});
