/**
 * Compiles the vendored Schematron files in rules-src/ into the JSON rule sets in src/rules/.
 * Run with `pnpm rules` after updating rules-src/. CI checks that the output is up to date.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileSchematron, type MessagePart } from "../src/schematron";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(root, "rules-src", path), "utf8");
const common = read("xrechnung/common.sch");
// Versions and sources of the vendored rule sets (rules-src/sources.json): the single place where
// they are recorded. The compiled output carries them in src/rules/info.json.
const manifest: {
  [source: string]: unknown;
  sets: Record<string, { source: string; name: string }>;
} = JSON.parse(read("sources.json"));
const notice = readFileSync(join(root, "NOTICE.md"), "utf8");
const info: Record<string, unknown> = {};
// German messages, keyed by the English message with value parts replaced by {0}, {1}, ...
const de: Record<string, string> = JSON.parse(read("i18n/de.json"));
let translated = 0;
let untranslated = 0;

const sets = [
  { id: "en16931-ubl", file: "en16931/EN16931-UBL-validation-preprocessed.sch" },
  { id: "en16931-cii", file: "en16931/EN16931-CII-validation-preprocessed.sch" },
  { id: "xrechnung-ubl", file: "xrechnung/XRechnung-UBL-validation.sch" },
  { id: "xrechnung-cii", file: "xrechnung/XRechnung-CII-validation.sch" },
];

for (const { id, file } of sets) {
  const set = compileSchematron(read(file), { id, includes: { "../common.sch": common } });
  for (const pattern of set.patterns) {
    for (const rule of pattern.rules) {
      for (const a of rule.asserts) {
        // Messages start with the rule id ("[BR-01]-..."); the id is reported separately.
        const first = a.message[0];
        if (typeof first === "string") {
          a.message[0] = first.replace(/^\s*\[[^\]]+\]\s*-?\s*/, "");
        }
        a.message = a.message.map((part) =>
          typeof part === "string" ? part.replace(/\s+/g, " ") : part,
        );
        const values = a.message.filter((part) => typeof part !== "string");
        let i = 0;
        const key = a.message
          .map((part) => (typeof part === "string" ? part : `{${i++}}`))
          .join("")
          .replace(/\s+/g, " ")
          .trim();
        const german = de[key];
        if (german) {
          a.messageDe = german
            .split(/(\{\d+\})/)
            .filter((part) => part !== "")
            .map((part) => {
              const m = /^\{(\d+)\}$/.exec(part);
              return m ? (values[Number(m[1])] as MessagePart) : part;
            });
          translated++;
        } else {
          untranslated++;
        }
      }
    }
  }
  const count = set.patterns.reduce(
    (n, p) => n + p.rules.reduce((m, r) => m + r.asserts.length, 0),
    0,
  );
  const entry = manifest.sets[id];
  const origin = entry && (manifest[entry.source] as Record<string, string> | undefined);
  if (!entry || !origin) throw new Error(`rules-src/sources.json has no entry for ${id}`);
  // Guard against drift: the EN 16931 files state their own version, NOTICE.md names the release.
  const stated = /Schematron version ([\d.]+)/.exec(read(file))?.[1];
  if (stated && stated !== origin.version)
    throw new Error(`${file} is version ${stated}, sources.json says ${origin.version}`);
  if (!notice.includes(`release ${origin.release}`))
    throw new Error(`NOTICE.md does not mention "release ${origin.release}" (${id})`);
  info[id] = {
    id,
    name: entry.name,
    version: origin.version,
    release: origin.release,
    publisher: origin.publisher,
    source: origin.url,
    license: origin.licence,
    rules: count,
  };
  writeFileSync(join(root, "src/rules", `${id}.json`), `${JSON.stringify(set)}\n`);
  console.log(`${id}: ${count} assertions`);
}
writeFileSync(join(root, "src/rules/info.json"), `${JSON.stringify(info, null, 2)}\n`);
console.log(
  `German messages: ${translated} translated, ${untranslated} kept (already German or new)`,
);
