import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli";
import { RULE_SETS, ruleSet, ruleSetInfo } from "../src/rules/index";
import { checkRuleSets, type FetchLike } from "../src/rules-check";
import { validateInvoice } from "../src/validate";

const valid = join(
  __dirname,
  "fixtures/xrechnung-testsuite/business-cases/standard/01.01a-INVOICE_ubl.xml",
);

function respond(routes: Record<string, unknown>): FetchLike {
  return async (url) => {
    const hit = Object.entries(routes).find(([key]) => url.includes(key));
    if (!hit) throw new Error("offline");
    const body = hit[1];
    return typeof body === "number"
      ? { ok: false, status: body, json: async () => ({}) }
      : { ok: true, status: 200, json: async () => body };
  };
}

const release = (tag: string, extra: object = {}) => ({ tag_name: tag, ...extra });
const current = {
  "eInvoicing-EN16931/releases": [release("validation-1.3.16"), release("validation-1.3.15")],
  "xrechnung-schematron/releases": [release("v2.6.0")],
};

async function run(args: string[], fetch?: FetchLike) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(args, { out: (l) => out.push(l), err: (l) => err.push(l) }, { fetch });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

describe("rule set information", () => {
  it("lists every compiled rule set with version, source, licence and rule count", () => {
    const infos = ruleSetInfo();
    expect(infos.map((i) => i.id)).toEqual([
      "en16931-ubl",
      "en16931-cii",
      "xrechnung-ubl",
      "xrechnung-cii",
    ]);
    for (const i of infos) {
      const count = ruleSet(i.id).patterns.reduce(
        (n, p) => n + p.rules.reduce((m, r) => m + r.asserts.length, 0),
        0,
      );
      expect(i.rules).toBe(count);
      expect(i.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(i.source).toMatch(/^https:\/\/github\.com\//);
      expect(i.license).toBeTruthy();
      expect(i.publisher).toBeTruthy();
      expect(JSON.stringify(i)).not.toMatch(/compiledAt/);
    }
    expect(ruleSetInfo("xrechnung-cii")).toBe(RULE_SETS["xrechnung-cii"]);
  });

  it("states the version the EN 16931 files declare and the one NOTICE.md names", () => {
    const root = join(__dirname, "..");
    const header = readFileSync(
      join(root, "rules-src/en16931/EN16931-UBL-validation-preprocessed.sch"),
      "utf8",
    );
    expect(/Schematron version ([\d.]+)/.exec(header)?.[1]).toBe(RULE_SETS["en16931-ubl"].version);
    const notice = readFileSync(join(root, "NOTICE.md"), "utf8");
    for (const i of ruleSetInfo()) expect(notice).toContain(`release ${i.release}`);
  });

  it("is carried by validation results", () => {
    const r = validateInvoice(readFileSync(valid));
    expect(r.ruleSets).toEqual([RULE_SETS["en16931-ubl"], RULE_SETS["xrechnung-ubl"]]);
    expect(r.ruleSets[0]?.rules).toBeGreaterThan(0);
  });

  it("prints a table and JSON with the CLI", async () => {
    const table = await run(["rules"]);
    expect(table.code).toBe(0);
    expect(table.out).toMatch(/^Rule set +Version +Rules +Licence/);
    expect(table.out).toMatch(/xrechnung-ubl +v2\.6\.0 +56 +Apache-2\.0/);
    const json = JSON.parse((await run(["rules", "--json"])).out);
    expect(json).toEqual(ruleSetInfo());
  });
});

describe("rule set update check", () => {
  it("reports up to date", async () => {
    const result = await checkRuleSets({ fetch: respond(current) });
    expect(result.map((r) => r.status)).toEqual(Array(4).fill("up-to-date"));
  });

  it("finds newer releases, ignores drafts, prereleases and unrelated tags", async () => {
    const result = await checkRuleSets({
      fetch: respond({
        "eInvoicing-EN16931/releases": [
          release("validation-1.3.17", { prerelease: true }),
          release("validation-1.3.18", { draft: true }),
          release("codelists-9.9.9"),
          release("validation-1.3.16"),
        ],
        "xrechnung-schematron/releases": [release("v2.6.1"), release("v2.10.0"), release("v2.6.0")],
      }),
    });
    expect(result.map((r) => [r.id, r.status, r.latest])).toEqual([
      ["en16931-ubl", "up-to-date", undefined],
      ["en16931-cii", "up-to-date", undefined],
      ["xrechnung-ubl", "outdated", "v2.10.0"],
      ["xrechnung-cii", "outdated", "v2.10.0"],
    ]);
  });

  it("falls back to tags when there are no releases", async () => {
    const result = await checkRuleSets({
      fetch: respond({
        "eInvoicing-EN16931/releases": [],
        "eInvoicing-EN16931/tags": [{ name: "validation-1.4.0" }],
        "xrechnung-schematron": [release("v2.6.0")],
      }),
    });
    expect(result[0]).toMatchObject({ status: "outdated", latest: "validation-1.4.0" });
  });

  it("never throws: failures become 'could not check'", async () => {
    const result = await checkRuleSets({
      fetch: respond({
        "eInvoicing-EN16931": 403,
        "xrechnung-schematron/releases": [release("x")],
        "xrechnung-schematron/tags": [],
      }),
    });
    expect(result[0]).toMatchObject({ status: "unknown", reason: expect.stringContaining("403") });
    expect(result[2]).toMatchObject({ status: "unknown", reason: "no release tag recognised" });
    const offline = await checkRuleSets({ fetch: respond({}) });
    expect(offline.every((r) => r.status === "unknown")).toBe(true);
  });

  it("sends only a plain GET to api.github.com, no token unless given", async () => {
    const seen: Array<{ url: string; headers?: Record<string, string> }> = [];
    const fetch: FetchLike = async (url, init) => {
      seen.push({ url, ...(init?.headers ? { headers: init.headers } : {}) });
      return { ok: true, status: 200, json: async () => [release("v1.0.0")] };
    };
    await checkRuleSets({ fetch });
    expect(seen.length).toBeGreaterThan(0);
    for (const s of seen) {
      expect(s.url).toMatch(/^https:\/\/api\.github\.com\/repos\/[\w.-]+\/[\w.-]+\/releases\?/);
      expect(Object.keys(s.headers ?? {})).not.toContain("Authorization");
    }
  });

  it("CLI: prints the status per rule set and exits 0 or 3", async () => {
    const ok = await run(["rules", "--check", "--fail-on-outdated"], respond(current));
    expect(ok.code).toBe(0);
    expect(ok.out).toMatch(/en16931-ubl .*up to date/);

    const newer = respond({
      ...current,
      "xrechnung-schematron/releases": [release("v2.7.0")],
    });
    const plain = await run(["rules", "--check"], newer);
    expect(plain.code).toBe(0);
    expect(plain.out).toMatch(/xrechnung-cii .*newer release available: v2\.7\.0/);
    const strict = await run(["rules", "--check", "--fail-on-outdated"], newer);
    expect(strict.code).toBe(3);

    const offline = await run(["rules", "--check", "--fail-on-outdated"], respond({}));
    expect(offline.code).toBe(0);
    expect(offline.out).toContain("could not check: offline");

    const json = JSON.parse((await run(["rules", "--check", "--json"], newer)).out);
    expect(json[3].check).toEqual({ status: "outdated", latest: "v2.7.0" });
    expect((await run(["rules", "--fail-on-outdated"])).code).toBe(2);
  });
});
