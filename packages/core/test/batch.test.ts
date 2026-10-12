/**
 * validateMany with real worker threads. The workers load the built `dist/batch-worker.js`
 * (test/setup-dist.ts builds it when needed), so the pool is tested the way users get it.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { generateInvoice } from "../bench/generate";
import type * as BatchModule from "../src/batch";
import { validateInvoice } from "../src/validate";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { validateMany } = (await import(join(root, "dist/batch.js"))) as typeof BatchModule;
const suite = join(root, "test/fixtures/xrechnung-testsuite/business-cases/standard");
const ubl = join(suite, "01.01a-INVOICE_ubl.xml");
const cii = join(suite, "01.01a-INVOICE_uncefact.xml");
const pdf = join(root, "test/fixtures/pdf/EN16931_Einfach.pdf");

const dir = mkdtempSync(join(tmpdir(), "summand-batch-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const big = join(dir, "big.xml");
writeFileSync(big, generateInvoice("ubl", "xrechnung", 400));
const broken = join(dir, "broken.xml");
writeFileSync(broken, "<Invoice><unclosed></Invoice>");

/** The result without the duration, which differs from run to run. */
const stable = <T extends { durationMs?: number }>(r: T | undefined) => ({ ...r, durationMs: 0 });

describe("validateMany", () => {
  it("returns the same results as validateInvoice, in input order, whichever finishes first", async () => {
    // A slow invoice first: with several workers the small ones finish before it.
    const files = [big, ubl, cii, pdf, ubl, cii, ubl, big, pdf];
    const results = await validateMany(files, { concurrency: 3 }).toArray();
    expect(results.map((r) => r.index)).toEqual(files.map((_, i) => i));
    expect(results.map((r) => r.name)).toEqual(files);
    for (const [i, file] of files.entries()) {
      expect(stable(results[i]?.result)).toEqual(stable(validateInvoice(readFileSync(file))));
    }
  });

  it("gives the same results with 1 (calling thread), 2 and 4 workers", async () => {
    const files = [ubl, cii, pdf, broken, ubl, cii];
    const runs = await Promise.all(
      [1, 2, 4].map((concurrency) => validateMany(files, { concurrency }).toArray()),
    );
    const normalise = (r: Awaited<(typeof runs)[number]>) =>
      r.map((x) => ({ ...x, result: stable(x.result) }));
    expect(normalise(runs[1] as never)).toEqual(normalise(runs[0] as never));
    expect(normalise(runs[2] as never)).toEqual(normalise(runs[0] as never));
  });

  it("reports an invalid invoice as a result and an unreadable file as an error, and never throws", async () => {
    const results = await validateMany(
      [broken, join(dir, "missing.xml"), dir, ubl, { name: "text", data: "<Order/>" }],
      { concurrency: 2 },
    ).toArray();
    expect(results[0]?.result?.valid).toBe(false);
    expect(results[0]?.result?.errors[0]?.id).toBe("SUM-XML");
    expect(results[0]?.error).toBeUndefined();
    for (const i of [1, 2]) {
      expect(results[i]?.result).toBeUndefined();
      expect(results[i]?.error?.code).toBe("SUM-BATCH");
      expect(results[i]?.error?.message).toMatch(/ENOENT|EISDIR/);
    }
    expect(results[3]?.result?.valid).toBe(true);
    expect(results[4]).toMatchObject({ index: 4, name: "text" });
    expect(results[4]?.result?.errors[0]?.id).toBe("SUM-FORMAT");
  });

  it("turns an input the worker cannot process into an error and keeps going", async () => {
    const results = await validateMany(
      [
        { name: "bad", data: (() => {}) as never },
        { name: "ok", data: readFileSync(ubl) },
      ],
      { concurrency: 2 },
    ).toArray();
    expect(results[0]?.error?.code).toBe("SUM-BATCH");
    expect(results[1]?.result?.valid).toBe(true);
  });

  it("applies the validation options to every input", async () => {
    const results = await validateMany([ubl, ubl, cii], {
      concurrency: 2,
      ruleSets: ["en16931", "xrechnung@2.5.0"],
      lang: "de",
    }).toArray();
    for (const r of results) {
      expect(r.result?.ruleSets.map((s) => `${s.id}@${s.version}`)).toContain(
        r.name === cii ? "xrechnung-cii@2.5.0" : "xrechnung-ubl@2.5.0",
      );
    }
  });

  it("streams: results can be read while later inputs are still being produced", async () => {
    const produced: number[] = [];
    async function* source() {
      for (let i = 0; i < 40; i++) {
        produced.push(i);
        yield ubl;
        await new Promise((resolve) => setImmediate(resolve));
      }
    }
    const seen: number[] = [];
    for await (const r of validateMany(source(), { concurrency: 2 })) {
      seen.push(r.index);
      if (seen.length === 1) {
        // Inputs are pulled lazily: nowhere near all 40 are produced yet.
        expect(produced.length).toBeLessThan(12);
      }
    }
    expect(seen).toEqual(Array.from({ length: 40 }, (_, i) => i));
  });

  it("stops the workers when the consumer leaves the loop early", async () => {
    let produced = 0;
    function* source() {
      for (let i = 0; i < 100_000; i++) {
        produced++;
        yield ubl;
      }
    }
    const started = Date.now();
    for await (const r of validateMany(source(), { concurrency: 2 })) {
      expect(r.index).toBe(0);
      break;
    }
    expect(produced).toBeLessThan(20);
    expect(Date.now() - started).toBeLessThan(10_000);
    // A new batch works afterwards.
    expect((await validateMany([ubl], { concurrency: 2 }).toArray())[0]?.result?.valid).toBe(true);
  });

  it("rejects when the signal aborts", async () => {
    const controller = new AbortController();
    const run = validateMany(Array(200).fill(big), { concurrency: 2, signal: controller.signal });
    const received: number[] = [];
    const reason = new Error("stop");
    await expect(
      (async () => {
        for await (const r of run) {
          received.push(r.index);
          controller.abort(reason);
        }
      })(),
    ).rejects.toBe(reason);
    expect(received.length).toBeLessThan(200);
  });

  it("handles an empty batch and accepts async iterables of inputs", async () => {
    expect(await validateMany([], { concurrency: 4 }).toArray()).toEqual([]);
    async function* source() {
      yield ubl;
      yield cii;
    }
    const results = await validateMany(source(), { concurrency: 2 }).toArray();
    expect(results.map((r) => r.result?.valid)).toEqual([true, true]);
  });

  it("can be consumed once and rejects a bad concurrency", async () => {
    const run = validateMany([ubl], { concurrency: 1 });
    await run.toArray();
    await expect(run.toArray()).rejects.toThrow(/only once/);
    for (const concurrency of [0, -1, 1.5, Number.NaN]) {
      expect(() => validateMany([ubl], { concurrency })).toThrow(RangeError);
    }
  });

  it("works from the CommonJS build", async () => {
    const { createRequire } = await import("node:module");
    const cjs = createRequire(import.meta.url)(join(root, "dist/batch.cjs")) as typeof BatchModule;
    const results = await cjs.validateMany([ubl, cii], { concurrency: 2 }).toArray();
    expect(results.map((r) => r.result?.valid)).toEqual([true, true]);
  });
});
