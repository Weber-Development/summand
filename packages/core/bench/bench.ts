/**
 * Benchmark: times validateInvoice and each phase on invoices with 100, 1000 and 5000 lines.
 * Not run in CI. Usage (from packages/core):
 *
 *   pnpm bench                  # all sizes, 7 runs each
 *   pnpm bench --runs 11 --sizes 100,1000
 *   pnpm bench --runs 1 --warmup 0 --sizes 5000   # one timed run, no warm-up (very slow engines)
 *   pnpm bench --json           # machine-readable output
 *
 * Phases are measured separately on a parsed document (parse, XSD, EN 16931, XRechnung); "total"
 * is the whole validateInvoice call (decode, parse, summary, all phases). Reported times are the
 * median of the runs after one warm-up run, in milliseconds.
 */
import { cpus, platform, release } from "node:os";
import { parseArgs } from "node:util";
import { detect } from "../src/detect";
import { ruleSet } from "../src/rules/index";
import { runSchematron } from "../src/schematron";
import { validateInvoice } from "../src/validate";
import { parseXml } from "../src/xml";
import { validateSchema } from "../src/xsd";
import { type Flavour, generateInvoice, type Syntax } from "./generate";

const { values } = parseArgs({
  options: {
    runs: { type: "string", default: "7" },
    warmup: { type: "string", default: "1" },
    sizes: { type: "string", default: "100,1000,5000" },
    json: { type: "boolean" },
  },
});
const runs = Number(values.runs);
const warmup = Number(values.warmup);
const sizes = (values.sizes as string).split(",").map(Number);

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

function time(fn: () => unknown, n: number): number {
  for (let i = 0; i < warmup; i++) fn();
  const samples: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = performance.now();
    fn();
    samples.push(performance.now() - t);
  }
  return median(samples);
}

interface Row {
  syntax: Syntax;
  flavour: Flavour;
  lines: number;
  bytes: number;
  valid: boolean;
  messages: number;
  ms: Record<string, number>;
}

const rows: Row[] = [];
for (const lines of sizes) {
  // Fewer runs for the largest documents so the benchmark stays reasonable.
  const n = lines >= 5000 ? Math.min(runs, Math.max(3, Math.floor(runs / 2))) : runs;
  for (const syntax of ["ubl", "cii"] as const) {
    for (const flavour of ["xrechnung", "en16931"] as const) {
      const xml = generateInvoice(syntax, flavour, lines);
      const doc = parseXml(xml);
      const detection = detect(doc);
      if (detection === "zugferd-1" || detection === "not-an-invoice") throw new Error("detect");
      const result = validateInvoice(xml);
      const ms: Record<string, number> = {};
      ms.parse = time(() => parseXml(xml), n);
      ms.xsd = time(() => validateSchema(doc, syntax === "cii" ? "cii-d16b" : "ubl-2.1"), n);
      ms.en16931 = time(() => runSchematron(ruleSet(`en16931-${syntax}`), doc), n);
      if (flavour === "xrechnung")
        ms.xrechnung = time(() => runSchematron(ruleSet(`xrechnung-${syntax}`), doc), n);
      ms.total = time(() => validateInvoice(xml), n);
      console.error(`${syntax} ${flavour} ${lines} lines: total ${ms.total?.toFixed(0)} ms`);
      rows.push({
        syntax,
        flavour,
        lines,
        bytes: xml.length,
        valid: result.valid,
        messages: result.errors.length + result.warnings.length + result.infos.length,
        ms,
      });
    }
  }
}

const machine = `${cpus()[0]?.model.trim()} x${cpus().length}, ${platform()} ${release()}, Node ${process.version}`;
if (values.json) {
  console.log(JSON.stringify({ machine, runs, rows }, null, 2));
} else {
  console.log(`Machine: ${machine}`);
  console.log(
    `Median of ${runs} runs (at most ${Math.max(3, Math.floor(runs / 2))} for 5000 lines), ms, after ${warmup} warm-up run(s)\n`,
  );
  const cols = ["parse", "xsd", "en16931", "xrechnung", "total"];
  console.log(
    ["syntax", "flavour", "lines", "KB", "valid", "msgs", ...cols]
      .map((c) => c.padStart(9))
      .join(""),
  );
  for (const r of rows) {
    console.log(
      [
        r.syntax,
        r.flavour,
        r.lines,
        Math.round(r.bytes / 1024),
        r.valid,
        r.messages,
        ...cols.map((c) => (r.ms[c] === undefined ? "-" : r.ms[c].toFixed(1))),
      ]
        .map((c) => String(c).padStart(9))
        .join(""),
    );
  }
}
