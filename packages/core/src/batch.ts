/**
 * Batch validation: many invoices with a bounded pool of worker threads. Node.js only (it uses
 * `worker_threads` and the file system); in the browser call `validateInvoice` once per file.
 * This module is a separate entry point (`@sweberdev/summand/batch`) so that the main bundle
 * does not carry it.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { availableParallelism, cpus } from "node:os";
import { Worker } from "node:worker_threads";
import {
  type InvoiceInput,
  type ValidateOptions,
  type ValidationResult,
  validateInvoice,
} from "./validate";

/**
 * One invoice for {@link validateMany}: a string is the path of a file (UBL or CII XML, or a
 * ZUGFeRD / Factur-X PDF, read by the worker); an object carries the content you already have.
 * A string is never XML text: pass XML text as `{ name, data }`.
 */
export type BatchInput = string | { name: string; data: InvoiceInput };

/** Why an input could not be validated at all (as opposed to being an invalid invoice). */
export interface BatchError {
  /** Always "SUM-BATCH", see the error code catalogue. */
  code: "SUM-BATCH";
  /** What went wrong, e.g. the file system error for an unreadable path. */
  message: string;
}

/**
 * The outcome for one input of {@link validateMany}. Exactly one of `result` and `error` is set:
 * `result` when the input was processed (the invoice can still be invalid, see `result.valid`),
 * `error` when it could not be read or the worker failed.
 */
export interface BatchResult {
  /** Position of the input in the batch, starting at 0. Results come back in this order. */
  index: number;
  /** The file path, or the `name` of the input. */
  name: string;
  /** The validation result, as {@link validateInvoice} returns it. */
  result?: ValidationResult;
  /** Set instead of `result` when the input could not be processed. */
  error?: BatchError;
}

/** Options of {@link validateMany}. All are optional; the validation options apply to every input. */
export interface ValidateManyOptions extends ValidateOptions {
  /**
   * How many invoices are validated at the same time, each in its own worker thread. Default
   * `min(4, number of CPU cores)`. With 1 the invoices are validated one after the other on the
   * calling thread and no worker is started.
   */
  concurrency?: number;
  /**
   * Stops the batch: pending inputs are dropped, workers are terminated and the iteration
   * rejects with the reason of the signal.
   */
  signal?: AbortSignal;
}

/**
 * A running batch: iterate it with `for await` to receive results as soon as they are ready (in
 * input order), or call {@link BatchRun.toArray} to wait for all of them. It can be consumed once.
 * Leaving the loop early (`break`, `return`, an exception) terminates the workers.
 */
export interface BatchRun extends AsyncIterable<BatchResult> {
  /** Waits for the whole batch and returns all results in input order. */
  toArray(): Promise<BatchResult[]>;
}

interface Task {
  index: number;
  item: BatchInput;
  resolve: (result: BatchResult) => void;
}

interface Slot {
  worker: Worker;
  task: Task | undefined;
  dead: boolean;
}

type Reply = { index: number; result: ValidationResult } | { index: number; error: string };

interface Runner {
  run(index: number, item: BatchInput): Promise<BatchResult>;
  close(): Promise<void>;
}

const nameOf = (item: BatchInput) => (typeof item === "string" ? item : item.name);

const failed = (index: number, item: BatchInput, message: string): BatchResult => ({
  index,
  name: nameOf(item),
  error: { code: "SUM-BATCH", message },
});

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Validates on the calling thread, one input at a time. */
function inlineRunner(options: ValidateOptions): Runner {
  return {
    async run(index, item) {
      try {
        const data = typeof item === "string" ? new Uint8Array(await readFile(item)) : item.data;
        return { index, name: nameOf(item), result: validateInvoice(data, options) };
      } catch (e) {
        return failed(index, item, messageOf(e));
      }
    },
    async close() {},
  };
}

function workerFile(): URL {
  const url = new URL("./batch-worker.js", import.meta.url);
  if (!existsSync(url)) throw new Error(`Summand batch worker not found: ${url.href}`);
  return url;
}

/** A pool of at most `size` worker threads, started when work arrives. */
function workerRunner(size: number, options: ValidateOptions): Runner {
  const slots = new Set<Slot>();
  const idle: Slot[] = [];
  const queue: Task[] = [];
  let closing = false;

  function settle(slot: Slot, result: BatchResult) {
    const task = slot.task;
    slot.task = undefined;
    task?.resolve(result);
  }

  function retire(slot: Slot, reason: string) {
    if (slot.dead) return;
    slot.dead = true;
    slots.delete(slot);
    const at = idle.indexOf(slot);
    if (at !== -1) idle.splice(at, 1);
    if (slot.task) settle(slot, failed(slot.task.index, slot.task.item, reason));
    void slot.worker.terminate();
    if (!closing) dispatch();
  }

  function spawn(): Slot {
    const slot: Slot = {
      worker: new Worker(workerFile(), { workerData: { options } }),
      task: undefined,
      dead: false,
    };
    slots.add(slot);
    slot.worker.on("message", (reply: Reply) => {
      const task = slot.task;
      if (!task) return;
      settle(
        slot,
        "error" in reply
          ? failed(task.index, task.item, reply.error)
          : { index: task.index, name: nameOf(task.item), result: reply.result },
      );
      idle.push(slot);
      dispatch();
    });
    slot.worker.on("error", (e) => retire(slot, `The worker thread failed: ${messageOf(e)}`));
    slot.worker.on("exit", (code) =>
      retire(slot, `The worker thread exited unexpectedly (code ${code})`),
    );
    return slot;
  }

  function dispatch() {
    while (queue.length > 0 && !closing) {
      let slot = idle.pop();
      if (!slot && slots.size < size) {
        try {
          slot = spawn();
        } catch (e) {
          const task = queue.shift() as Task;
          task.resolve(failed(task.index, task.item, messageOf(e)));
          continue;
        }
      }
      if (!slot) return;
      const task = queue.shift() as Task;
      try {
        slot.worker.postMessage({ index: task.index, item: task.item });
        slot.task = task;
      } catch (e) {
        // Not cloneable, e.g. a function as data: this input fails, the worker stays usable.
        idle.push(slot);
        task.resolve(failed(task.index, task.item, messageOf(e)));
      }
    }
  }

  return {
    run(index, item) {
      return new Promise((resolve) => {
        queue.push({ index, item, resolve });
        dispatch();
      });
    },
    async close() {
      closing = true;
      for (const task of queue.splice(0)) task.resolve(failed(task.index, task.item, "Cancelled"));
      await Promise.all(
        [...slots].map((slot) => {
          slot.dead = true;
          if (slot.task) settle(slot, failed(slot.task.index, slot.task.item, "Cancelled"));
          return slot.worker.terminate();
        }),
      );
      slots.clear();
      idle.length = 0;
    },
  };
}

function defaultConcurrency(): number {
  const cores = typeof availableParallelism === "function" ? availableParallelism() : cpus().length;
  return Math.max(1, Math.min(4, cores));
}

function asAsync<T>(source: Iterable<T> | AsyncIterable<T>): AsyncIterator<T> {
  const asyncIterator = (source as AsyncIterable<T>)[Symbol.asyncIterator];
  if (typeof asyncIterator === "function") return asyncIterator.call(source);
  const it = (source as Iterable<T>)[Symbol.iterator]();
  return {
    next: async () => it.next(),
    return: async (value?: unknown) => it.return?.(value) ?? { done: true, value: undefined },
  } as AsyncIterator<T>;
}

/**
 * Validates many invoices with a bounded pool of worker threads and returns the results in input
 * order. Node.js only.
 *
 * - Results arrive as an async iterator, so a large folder never has to fit in memory: inputs
 *   are pulled lazily (at most twice `concurrency` are in flight or waiting for the consumer).
 * - The order of the results is the order of the inputs, whatever finishes first.
 * - Nothing is thrown per input: an unreadable file or a failing worker becomes a
 *   {@link BatchResult} with `error`. An invalid invoice is a result with `result.valid` false.
 * - Every input is validated with the same `options` as {@link validateInvoice}.
 *
 * Throws a `RangeError` when `concurrency` is not a positive integer.
 *
 * @example
 * for await (const { name, result, error } of validateMany(["a.xml", "b.pdf"], { lang: "de" })) {
 *   console.log(name, error ? error.message : result?.valid);
 * }
 * const all = await validateMany(files, { concurrency: 2 }).toArray();
 */
export function validateMany(
  inputs: Iterable<BatchInput> | AsyncIterable<BatchInput>,
  options: ValidateManyOptions = {},
): BatchRun {
  const { concurrency = defaultConcurrency(), signal, ...validateOptions } = options;
  if (!Number.isInteger(concurrency) || concurrency < 1)
    throw new RangeError(`concurrency must be a positive integer, got ${concurrency}`);
  const window = concurrency * 2;
  let started = false;

  async function* iterate(): AsyncGenerator<BatchResult, void, undefined> {
    const runner =
      concurrency === 1
        ? inlineRunner(validateOptions)
        : workerRunner(concurrency, validateOptions);
    const source = asAsync(inputs);
    const ready = new Map<number, BatchResult>();
    let waiters: Array<() => void> = [];
    let dispatched = 0;
    let emitted = 0;
    let exhausted = false;
    let closed = false;
    let failure: { error: unknown } | undefined;
    const wake = () => {
      const w = waiters;
      waiters = [];
      for (const resolve of w) resolve();
    };
    const wait = () => new Promise<void>((resolve) => waiters.push(resolve));
    const onAbort = () => {
      failure ??= { error: signal?.reason ?? new Error("Aborted") };
      closed = true;
      wake();
    };
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });

    const feeder = (async () => {
      try {
        while (!closed) {
          while (!closed && dispatched - emitted >= window) await wait();
          if (closed) break;
          const next = await source.next();
          if (next.done) break;
          if (closed) break;
          const index = dispatched++;
          void runner.run(index, next.value).then((result) => {
            ready.set(index, result);
            wake();
          });
        }
      } catch (error) {
        failure ??= { error };
      } finally {
        exhausted = true;
        wake();
      }
    })();

    try {
      while (true) {
        if (failure && closed) break;
        const result = ready.get(emitted);
        if (result) {
          ready.delete(emitted);
          emitted++;
          wake();
          yield result;
          continue;
        }
        if (exhausted && emitted >= dispatched) break;
        await wait();
      }
      if (failure) throw failure.error;
    } finally {
      closed = true;
      signal?.removeEventListener("abort", onAbort);
      wake();
      await runner.close();
      // Do not wait for a source that is still producing its next item.
      void Promise.resolve(source.return?.()).catch(() => {});
      void feeder;
    }
  }

  const run: BatchRun = {
    [Symbol.asyncIterator]() {
      if (started) throw new Error("A validateMany run can be consumed only once");
      started = true;
      return iterate();
    },
    async toArray() {
      const out: BatchResult[] = [];
      for await (const r of run) out.push(r);
      return out;
    },
  };
  return run;
}
