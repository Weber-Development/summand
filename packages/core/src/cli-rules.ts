import { parseArgs } from "node:util";
import { EXIT_CODES } from "./exit-codes";
import { type RuleSetInfo, ruleSetInfo } from "./rules/index";
import { checkRuleSets, type RuleSetCheck, type RuleSetCheckOptions } from "./rules-check";

interface Io {
  out: (line: string) => void;
  err: (line: string) => void;
}

function table(rows: string[][]): string[] {
  const widths = (rows[0] as string[]).map((_, i) =>
    Math.max(...rows.map((r) => (r[i] as string).length)),
  );
  return rows.map((r) =>
    r
      .map((c, i) => c.padEnd(widths[i] as number))
      .join("  ")
      .trimEnd(),
  );
}

function describe(check: RuleSetCheck): string {
  if (check.status === "up-to-date") return "up to date";
  if (check.status === "outdated") return `newer release available: ${check.latest}`;
  return `could not check: ${check.reason}`;
}

/** `summand rules [--json] [--check] [--fail-on-outdated]`: lists every bundled version. */
export async function rulesCommand(argv: string[], io: Io, check: RuleSetCheckOptions = {}) {
  const { values } = parseArgs({
    args: argv,
    options: {
      json: { type: "boolean" },
      check: { type: "boolean" },
      "fail-on-outdated": { type: "boolean" },
    },
  });
  if (values["fail-on-outdated"] && !values.check) {
    io.err("--fail-on-outdated needs --check.");
    return EXIT_CODES.error;
  }
  // Every bundled version, the defaults first. Only the defaults are compared with upstream.
  const infos: RuleSetInfo[] = ruleSetInfo({ versions: "all" });
  const defaults = ruleSetInfo();
  const isDefault = (i: RuleSetInfo) => defaults.includes(i);
  const token = process.env.SUMMAND_GITHUB_TOKEN;
  const checks = values.check
    ? await checkRuleSets({ ...(token ? { token } : {}), ...check })
    : undefined;
  const outdated = checks?.some((c) => c.status === "outdated") ?? false;

  if (values.json) {
    io.out(
      JSON.stringify(
        infos.map((info) => {
          const c = isDefault(info) ? checks?.find((x) => x.id === info.id) : undefined;
          return c
            ? { ...info, check: { status: c.status, latest: c.latest, reason: c.reason } }
            : info;
        }),
        null,
        2,
      ),
    );
  } else {
    const header = ["Rule set", "Version", "Rules", "Licence", "Publisher", "Source", "Used"];
    const rows = infos.map((i) => [
      i.id,
      i.release,
      String(i.rules),
      i.license,
      i.publisher,
      i.source,
      isDefault(i) ? "default" : `on request (@${i.version})`,
    ]);
    if (checks) {
      header.push("Update");
      rows.forEach((r, n) => {
        const info = infos[n] as RuleSetInfo;
        const c = isDefault(info) ? checks.find((x) => x.id === info.id) : undefined;
        r.push(c ? describe(c) : "older version, not compared");
      });
    }
    for (const line of table([header, ...rows])) io.out(line);
  }
  return outdated && values["fail-on-outdated"] ? EXIT_CODES.outdated : EXIT_CODES.ok;
}
