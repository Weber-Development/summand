/**
 * Benchmark: validateMany (worker pool) against a plain loop of validateInvoice on a folder of
 * invoices. Not run in CI. Needs the built package (`pnpm build`), because the workers load
 * `dist/batch-worker.js`. Usage (from packages/core):
 *
 *   pnpm bench:batch                        # three scenarios, 5 runs each
 *   pnpm bench:batch --runs 3 --concurrency 1,2,4,8
 *   pnpm bench:batch --json
 *
 * Scenarios: many small invoices (the XRechnung test suite samples, repeated), invoices with 100
 * lines and invoices with 1000 lines, generated like in bench.ts. Each run validates every file
 * once, including reading it from disk; the timer covers the whole batch (starting the workers
 * included). Reported times are the median of the runs after one warm-up run, in milliseconds.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism, cpus, platform, release, tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { validateInvoice } from "../src/validate";
import { generateInvoice } from "./generate";

const { values } = parseArgs({
  options: {
    runs: { type: "string", default: "5" },
    concurrency: { type: "string", default: "1,2,4" },
    json: { type: "boolean" },
  },
});
const runs = Number(values.runs);
const levels = (values.concurrency as string).split(",").map(Number);

// Imported from the build, like users get it.
const { validateMany } = (await import("../dist/batch.js")) as typeof import("../src/batch");

const samples = join(
  import.meta.dirname,
  "../test/fixtures/xrechnung-testsuite/business-cases/standard",
);
const dir = mkdtempSync(join(tmpdir(), "summand-bench-"));

function write(name: string, content: string | Buffer): string {
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

const small = readdirSync(samples)
  .filter((f) => f.endsWith(".xml") && readFileSync(join(samples, f)).length < 80_000)
  .map((f) => readFileSync(join(samples, f)));

const scenarios: Array<{ name: string; files: string[] }> = [
  {
    name: "200 small invoices (about 5 to 25 KB)",
    files: Array.from({ length: 200 }, (_, i) =>
      write(`small-${i}.xml`, small[i % small.length] as Buffer),
    ),
  },
  {
    name: "40 invoices with 100 lines (UBL and CII, about 110 to 195 KB)",
    files: Array.from({ length: 40 }, (_, i) =>
      write(`l100-${i}.xml`, generateInvoice(i % 2 ? "cii" : "ubl", "xrechnung", 100)),
    ),
  },
  {
    name: "8 invoices with 1000 lines (UBL and CII, about 1.1 to 1.9 MB)",
    files: Array.from({ length: 8 }, (_, i) =>
      write(`l1000-${i}.xml`, generateInvoice(i % 2 ? "cii" : "ubl", "xrechnung", 1000)),
    ),
  },
];

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

async function time(fn: () => Promise<unknown>): Promise<number> {
  await fn(); // warm-up
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    await fn();
    samples.push(performance.now() - t);
  }
  return median(samples);
}

interface Row {
  scenario: string;
  files: number;
  ms: Record<string, number>;
}

const rows: Row[] = [];
try {
  for (const { name, files } of scenarios) {
    const ms: Record<string, number> = {};
    ms.loop = await time(async () => {
      for (const f of files) validateInvoice(readFileSync(f));
    });
    for (const concurrency of levels) {
      ms[`validateMany(${concurrency})`] = await time(async () => {
        const results = await validateMany(files, { concurrency }).toArray();
        if (results.length !== files.length || results.some((r) => r.error))
          throw new Error("batch failed");
      });
    }
    console.error(`${name}: ${JSON.stringify(ms)}`);
    rows.push({ scenario: name, files: files.length, ms });
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const machine = `${cpus()[0]?.model.trim()}, ${availableParallelism()} available cores, ${platform()} ${release()}, Node ${process.version}`;
if (values.json) {
  console.log(JSON.stringify({ machine, runs, rows }, null, 2));
} else {
  console.log(`Machine: ${machine}`);
  console.log(`Median of ${runs} runs after 1 warm-up run, milliseconds for the whole batch\n`);
  for (const r of rows) {
    console.log(`${r.scenario}`);
    const base = r.ms.loop as number;
    for (const [k, v] of Object.entries(r.ms)) {
      console.log(
        `  ${k.padEnd(18)}${v.toFixed(0).padStart(8)} ms  ${(base / v).toFixed(2).padStart(6)}x  ${(r.files / (v / 1000)).toFixed(1).padStart(8)} files/s`,
      );
    }
  }
}
