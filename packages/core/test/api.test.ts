/**
 * The public API is a contract. These tests make accidental changes fail CI:
 *
 * - the snapshots in test/api/ list every export of every entry point with its declaration, the
 *   CLI surface and the exit codes. After an intended change, run `pnpm --filter
 *   @sweberdev/summand exec vitest run -u test/api.test.ts`, review the diff of test/api/ and
 *   describe it in the changeset (breaking changes need a major version).
 * - every export has TSDoc, deprecated ones say when they go away.
 * - docs/reference/api.md lists exactly the exports of each entry point.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli";
import { EXIT_CODES } from "../src/exit-codes";
import { type ApiExport, ENTRY_POINTS, publicApi } from "./helpers/public-api";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(root, "../..");
const apis = Object.fromEntries(
  Object.entries(ENTRY_POINTS).map(([path, entry]) => [path, publicApi(entry)]),
);

function render(path: string): string {
  const api = apis[path];
  if (!api) throw new Error(path);
  const lines = [`# @sweberdev/summand${path === "." ? "" : path.slice(1)}`, ""];
  for (const e of api.exports) {
    const flags = [e.kind, ...(e.beta ? ["beta"] : []), ...(e.deprecated ? ["deprecated"] : [])];
    lines.push(`## ${e.name} (${flags.join(", ")})`, "", "```ts", e.declaration, "```", "");
  }
  if (api.reachable.length > 0) {
    lines.push("# Types reachable from the exports above, not exported by name", "");
    for (const r of api.reachable)
      lines.push(`## ${r.name}`, "", "```ts", r.declaration, "```", "");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

describe("public API snapshot", () => {
  for (const path of Object.keys(ENTRY_POINTS)) {
    const file = path === "." ? "index" : path.slice(2);
    it(`entry point ${path}`, async () => {
      await expect(render(path)).toMatchFileSnapshot(`./api/${file}.api.md`);
    });
  }

  it("package surface: export map, binary, CLI help and exit codes", async () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const help: string[] = [];
    await runCli(["--help"], { out: (l) => help.push(l), err: () => {} });
    const surface = [
      "# Package surface",
      "",
      "## exports",
      ...Object.keys(pkg.exports).map((k) => `- ${k}`),
      "",
      "## bin",
      ...Object.keys(pkg.bin).map((k) => `- ${k}`),
      "",
      "## exit codes",
      ...Object.entries(EXIT_CODES).map(([name, code]) => `- ${code} ${name}`),
      "",
      "## summand --help",
      "",
      "```",
      ...help,
      "```",
      "",
    ].join("\n");
    await expect(surface).toMatchFileSnapshot("./api/package.api.md");
  });

  it("covers every entry point in the package export map", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const mapped = Object.keys(pkg.exports).filter((k) => k !== "./package.json");
    expect(mapped.sort()).toEqual(Object.keys(ENTRY_POINTS).sort());
  });

  it("exports at runtime exactly the values the types declare", async () => {
    const modules: Record<string, string> = {
      ".": "../src/index",
      "./xpath": "../src/xpath",
      "./rules-check": "../src/rules-check",
      "./cli": "../src/cli",
    };
    for (const [path, module] of Object.entries(modules)) {
      const runtime = Object.keys(await import(module)).sort();
      const declared = (apis[path]?.exports ?? [])
        .filter((e) => e.kind !== "type")
        .map((e) => e.name)
        .sort();
      expect(runtime, path).toEqual(declared);
    }
  });
});

describe("TSDoc", () => {
  const all: Array<[string, ApiExport]> = Object.entries(apis).flatMap(([path, api]) =>
    api.exports.map((e): [string, ApiExport] => [`${path} ${e.name}`, e]),
  );

  it("documents every public export", () => {
    const missing = all.filter(([, e]) => !e.documented).map(([name]) => name);
    expect(missing).toEqual([]);
  });

  it("says in every deprecation what to use instead and when it is removed", () => {
    for (const [name, e] of all) {
      if (e.deprecated === undefined) continue;
      expect(e.deprecated, name).toMatch(/Use `\w+`/);
      expect(e.deprecated, name).toMatch(/removed in \d+\.0\.0/);
    }
  });

  it("marks everything in the xpath entry point as advanced", () => {
    const notBeta = (apis["./xpath"]?.exports ?? []).filter((e) => !e.beta).map((e) => e.name);
    expect(notBeta).toEqual([]);
  });
});

/** Identifiers at the start of every code span in the first column of table rows. */
function documentedNames(section: string): Set<string> {
  const names = new Set<string>();
  for (const line of section.split("\n")) {
    if (!line.startsWith("| `")) continue;
    const firstCell = line.split(/(?<!\\)\|/)[1] ?? "";
    for (const m of firstCell.matchAll(/`([A-Za-z_]\w*)[^`]*`/g)) names.add(m[1] as string);
  }
  return names;
}

function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(`\n## ${heading}\n`);
  if (start === -1) throw new Error(`docs/reference/api.md has no section "${heading}"`);
  const next = markdown.indexOf("\n## ", start + 1);
  return markdown.slice(start, next === -1 ? undefined : next);
}

describe("docs/reference/api.md", () => {
  const markdown = readFileSync(join(repo, "docs/reference/api.md"), "utf8");

  for (const path of Object.keys(ENTRY_POINTS)) {
    const heading = `@sweberdev/summand${path === "." ? "" : path.slice(1)}`;
    it(`lists exactly the exports of ${heading}`, () => {
      const documented = documentedNames(section(markdown, heading));
      const exported = new Set((apis[path]?.exports ?? []).map((e) => e.name));
      expect([...exported].filter((n) => !documented.has(n)).sort(), "not documented").toEqual([]);
      expect([...documented].filter((n) => !exported.has(n)).sort(), "not exported").toEqual([]);
    });
  }

  it("puts every advanced export of the main entry point under Advanced", () => {
    const advanced = documentedNames(
      markdown.slice(
        markdown.indexOf("### Advanced"),
        markdown.indexOf("\n## @sweberdev/summand/xpath"),
      ),
    );
    const beta = (apis["."]?.exports ?? []).filter((e) => e.beta).map((e) => e.name);
    expect([...advanced].sort()).toEqual(beta.sort());
  });

  it("lists every CLI flag and command, and nothing the CLI does not know", async () => {
    const help: string[] = [];
    await runCli(["--help"], { out: (l) => help.push(l), err: () => {} });
    const helpText = help.join("\n");
    const flags = (text: string) => new Set(text.match(/--[a-z][a-z-]*/g) ?? []);
    const documented = flags(section(markdown, "Command line"));
    const real = flags(helpText);
    real.delete("--help");
    expect([...real].filter((f) => !documented.has(f)).sort(), "not documented").toEqual([]);
    expect([...documented].filter((f) => !real.has(f)).sort(), "not in the CLI").toEqual([]);
  });
});
