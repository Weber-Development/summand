/**
 * The pool logic of validateMany with a fake `Worker`: the default concurrency, the number of
 * threads started, and a worker that dies. The real threads are tested in batch.test.ts.
 */
import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  cores: 16,
  created: 0,
  crashOn: undefined as string | undefined,
  failToStart: false,
}));

vi.mock("node:fs", async (original) => ({
  ...(await original<typeof import("node:fs")>()),
  existsSync: () => true,
}));
vi.mock("node:os", async (original) => ({
  ...(await original<typeof import("node:os")>()),
  availableParallelism: () => state.cores,
}));
vi.mock("node:worker_threads", () => ({
  Worker: class extends EventEmitter {
    constructor() {
      super();
      if (state.failToStart) throw new Error("cannot start worker");
      state.created++;
    }
    postMessage({ index, item }: { index: number; item: string }) {
      setImmediate(() => {
        if (item === state.crashOn) {
          this.emit("exit", 1);
          return;
        }
        this.emit("message", { index, error: "fake" });
      });
    }
    terminate() {
      return Promise.resolve(0);
    }
  },
}));

const { validateMany } = await import("../src/batch");

const files = (n: number) => Array.from({ length: n }, (_, i) => `file-${i}.xml`);

beforeEach(() => {
  state.cores = 16;
  state.created = 0;
  state.crashOn = undefined;
  state.failToStart = false;
});

describe("validateMany pool", () => {
  it("defaults to min(4, cpus) workers", async () => {
    state.cores = 16;
    await validateMany(files(30)).toArray();
    expect(state.created).toBe(4);
    state.created = 0;
    state.cores = 2;
    await validateMany(files(30)).toArray();
    expect(state.created).toBe(2);
  });

  it("uses at most `concurrency` workers and starts none for an empty batch", async () => {
    await validateMany(files(30), { concurrency: 3 }).toArray();
    expect(state.created).toBe(3);
    state.created = 0;
    await validateMany([], { concurrency: 3 }).toArray();
    expect(state.created).toBe(0);
  });

  it("does not start a worker with concurrency 1", async () => {
    await validateMany(files(3), { concurrency: 1 }).toArray();
    expect(state.created).toBe(0);
  });

  it("reports the input a dying worker was processing and replaces the worker", async () => {
    state.crashOn = "file-3.xml";
    const results = await validateMany(files(10), { concurrency: 2 }).toArray();
    expect(results.map((r) => r.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(results[3]?.error).toEqual({
      code: "SUM-BATCH",
      message: expect.stringContaining("exited unexpectedly"),
    });
    expect(results.filter((r) => r.error?.message === "fake")).toHaveLength(9);
    expect(state.created).toBeGreaterThan(2);
  });

  it("turns a worker that cannot be started into an error per input", async () => {
    state.failToStart = true;
    const results = await validateMany(files(3), { concurrency: 2 }).toArray();
    expect(results.map((r) => r.error?.message)).toEqual(Array(3).fill("cannot start worker"));
  });
});
