---
title: Validating many invoices
description: validateMany validates folders and archives of invoices with a bounded pool of worker threads in Node.js - streaming results in input order, errors per file, measured speed-up.
---

`validateInvoice` is synchronous and validates one invoice on the calling thread. For a folder with thousands of invoices, `validateMany` from the subpath `@sweberdev/summand/batch` spreads the work over a bounded pool of worker threads, returns the results in input order and never throws for a single file. Available since 1.1.0.

```ts
import { validateMany } from "@sweberdev/summand/batch";

for await (const { index, name, result, error } of validateMany(files, { lang: "de" })) {
  if (error) console.error(`${name}: could not be processed: ${error.message}`);
  else if (!result.valid) console.log(`${name}: ${result.errors.length} error(s)`);
}
```

Node.js only. The module uses `worker_threads` and reads files from disk, so it does not run in the browser or on edge runtimes; see [In the browser](#in-the-browser). It is a separate entry point, so the main bundle does not carry it.

## Inputs

`validateMany(inputs, options?)` takes any iterable or async iterable. An entry is either:

| Entry | Meaning |
|---|---|
| a `string` | The **path of a file** (UBL or CII XML, or a ZUGFeRD / Factur-X PDF). The worker reads it, so file contents never travel through your main thread. A string is never treated as XML text. |
| `{ name, data }` | Content you already have: `data` is XML text, bytes or an `ArrayBuffer` (anything `validateInvoice` accepts). `name` labels the result. The data is copied to the worker. |

Inputs are pulled lazily, at most twice `concurrency` ahead of the consumer. A directory listing, a generator or a stream of archive entries therefore never has to fit in memory:

```ts
import { readdir } from "node:fs/promises";
import { join } from "node:path";

async function* xmlFiles(dir: string) {
  for (const name of await readdir(dir)) if (name.endsWith(".xml")) yield join(dir, name);
}

for await (const r of validateMany(xmlFiles("invoices/"))) { /* ... */ }
```

## Results

Every input gives exactly one `BatchResult`:

| Field | Content |
|---|---|
| `index` | Position of the input, starting at 0 |
| `name` | The path, or the `name` you gave |
| `result` | The `ValidationResult` of `validateInvoice` (set unless `error` is set). An **invalid invoice is a result** with `result.valid === false`. |
| `error` | `{ code: "SUM-BATCH", message }`, set instead of `result` when the input could not be processed: the file cannot be read (missing, a directory, no permission), the data could not be sent to the worker, or the worker failed. See [`SUM-BATCH`](../reference/error-codes.md#sum-batch). |

Results arrive **in input order**, whichever file finishes first. The same input gives the same sequence for every `concurrency`, which makes runs comparable and reports reproducible. A slow file delays the results behind it, not the work: the other workers keep going up to the window of twice `concurrency` results.

Nothing is thrown per input. `validateMany` throws synchronously only for a `concurrency` that is not a positive integer (`RangeError`), and the iteration rejects when the `signal` aborts or when your own input iterable throws.

## Streaming or array

```ts
const run = validateMany(files);

// streaming: handle each result as soon as it is ready (in order)
for await (const r of run) report(r);

// or collect everything (the whole batch is held in memory)
const all = await validateMany(files).toArray();
```

A run can be consumed once. Leaving the `for await` loop early (`break`, `return`, an exception) terminates the workers; nothing keeps running in the background.

## Options

`validateMany` takes every option of [`validateInvoice`](validate.md#options) (`lang`, `ruleSets`, `schema`, `includeXml`, ...), applied to every input, plus:

| Option | Default | Effect |
|---|---|---|
| `concurrency` | `min(4, number of CPU cores)` | How many invoices are validated at the same time, one worker thread each. Workers are started when there is work for them, and a worker that dies is replaced. With `1`, the invoices are validated one after another on the calling thread and no worker is started (useful for debugging and where worker threads are not available). |
| `signal` | none | An `AbortSignal`. When it aborts, pending inputs are dropped, workers are terminated and the iteration rejects with the signal's reason. |

The default is capped at 4 because validation is memory-hungry, see the measurements below; set a higher value if you have measured that it helps on your machine. Options are copied to the workers, so they must be plain data (no functions).

## Exit codes and reports

A script that wraps `validateMany` should do what `summand validate` does: exit 1 when some invoice is invalid, and 2 when some input has an `error`. An unreadable file must not look like a valid one.

```ts
let invalid = 0;
let failed = 0;
for await (const r of validateMany(files)) {
  if (r.error) failed++;
  else if (!r.result.valid) invalid++;
}
process.exitCode = failed ? 2 : invalid ? 1 : 0;
```

## How much faster

It depends on the invoices and, more than you would expect, on the machine. Measured numbers, the method and a control experiment are in [Performance](performance.md#validating-many-files). In short, on our 4-core test container: about 1.5x for 1,000-line invoices, at most 1.26x for 100-line invoices, and slower than a plain loop for batches of small invoices, because each worker has to start and warm up. The speed-up is limited by memory bandwidth, not only by the number of cores.

## In the browser

There is no browser version of `validateMany`: browsers have no `worker_threads` and no file system access by path. Call `validateInvoice` for each file instead. For many files, use a few Web Workers yourself, each running `validateInvoice` (see [In the browser](browser.md#size-and-speed)), and keep the number of workers small for the reason above.
