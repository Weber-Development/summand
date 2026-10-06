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
  writeFileSync(join(root, "src/rules", `${id}.json`), `${JSON.stringify(set)}\n`);
  console.log(`${id}: ${count} assertions`);
}
console.log(
  `German messages: ${translated} translated, ${untranslated} kept (already German or new)`,
);
