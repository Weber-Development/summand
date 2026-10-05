import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileSchematron } from "../src/schematron";

const root = join(__dirname, "..");

describe("bundled rule sets", () => {
  it("match the vendored Schematron sources (run pnpm rules after updating rules-src)", () => {
    const set = compileSchematron(
      readFileSync(join(root, "rules-src/xrechnung/XRechnung-UBL-validation.sch"), "utf8"),
      {
        id: "xrechnung-ubl",
        includes: {
          "../common.sch": readFileSync(join(root, "rules-src/xrechnung/common.sch"), "utf8"),
        },
      },
    );
    const bundled = JSON.parse(readFileSync(join(root, "src/rules/xrechnung-ubl.json"), "utf8"));
    expect(bundled.patterns.length).toBe(set.patterns.length);
    expect(bundled.functions).toEqual(set.functions);
    expect(
      bundled.patterns.flatMap((p: { rules: Array<{ asserts: Array<{ test: string }> }> }) =>
        p.rules.flatMap((r) => r.asserts.map((a) => a.test)),
      ),
    ).toEqual(set.patterns.flatMap((p) => p.rules.flatMap((r) => r.asserts.map((a) => a.test))));
  });
});
