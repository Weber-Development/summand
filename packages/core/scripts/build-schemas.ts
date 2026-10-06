/**
 * Compiles the vendored XML Schemas in schemas-src/ into the JSON models in src/schemas/.
 * Run with `pnpm schemas` after updating schemas-src/. CI checks that the output is up to date.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { compileXsd } from "../src/xsd-compile";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "schemas-src");

function load(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (rel: string) => {
    for (const entry of readdirSync(join(src, rel), { withFileTypes: true })) {
      const path = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".xsd")) files[path] = readFileSync(join(src, path), "utf8");
    }
  };
  walk(dir);
  return files;
}

const UBL_INVOICE = "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2";
const UBL_CREDIT_NOTE = "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2";
const CII = "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100";

const sets = [
  {
    id: "ubl",
    dir: "ubl-2.1",
    roots: [
      [UBL_INVOICE, "Invoice"],
      [UBL_CREDIT_NOTE, "CreditNote"],
    ] as Array<[string, string]>,
    // The UBL signature extension schemas are not vendored: ext:ExtensionContent is a lax
    // wildcard, so signature content is not validated.
    ignoreImports: ["urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2"],
  },
  {
    id: "cii",
    dir: "cii-d16b",
    roots: [[CII, "CrossIndustryInvoice"]] as Array<[string, string]>,
    ignoreImports: [],
  },
];

for (const set of sets) {
  const { model, notes } = compileXsd({
    files: load(set.dir),
    roots: set.roots,
    ignoreImports: set.ignoreImports,
  });
  const json = `${JSON.stringify(model)}\n`;
  writeFileSync(join(root, "src/schemas", `${set.id}.json`), json);
  const gz = gzipSync(json).length;
  console.log(
    `${set.id}: ${model.types.length} types, ${(json.length / 1024).toFixed(1)} KB (${(gz / 1024).toFixed(1)} KB gzipped)`,
  );
  for (const note of notes) console.log(`  note: ${note}`);
}
