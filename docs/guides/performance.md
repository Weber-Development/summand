---
title: Performance on large invoices
description: How long validation takes for invoices with 100, 1,000 and 5,000 lines, how it was measured and what changed.
---

Most invoices have a handful of lines and validate in a few milliseconds to a few tens of milliseconds. This page is about the other end: invoices with hundreds or thousands of lines, such as utility bills or consolidated billing.

## Numbers

Median of 5 runs after one warm-up run (3 runs for 5,000 lines), `validateInvoice` on a string, all phases on (XML Schema, EN 16931 rules, XRechnung rules), in milliseconds. Node 22.22.0 on an Intel Xeon @ 2.10 GHz with 4 virtual cores (a cloud container), Linux 6.18. Your machine will differ, compare the ratios rather than the absolute values.

| Invoice | Size | Before (0.3.0) | After | Faster |
|---|---|---|---|---|
| UBL XRechnung, 100 lines | 111 KB | 417 | 60 | 6.9x |
| UBL EN 16931, 100 lines | 111 KB | 316 | 35 | 9.1x |
| CII XRechnung, 100 lines | 195 KB | 476 | 40 | 12x |
| CII EN 16931, 100 lines | 195 KB | 470 | 37 | 12.6x |
| UBL XRechnung, 1,000 lines | 1.1 MB | 5,988 | 675 | 8.9x |
| UBL EN 16931, 1,000 lines | 1.1 MB | 5,519 | 504 | 11x |
| CII XRechnung, 1,000 lines | 1.9 MB | 29,819 | 420 | 71x |
| CII EN 16931, 1,000 lines | 1.9 MB | 28,884 | 401 | 72x |
| UBL XRechnung, 5,000 lines | 5.4 MB | fails (stack overflow) | 4,552 | - |
| UBL EN 16931, 5,000 lines | 5.4 MB | fails (stack overflow) | 3,150 | - |
| CII XRechnung, 5,000 lines | 9.5 MB | fails (stack overflow) | 2,467 | - |
| CII EN 16931, 5,000 lines | 9.5 MB | fails (stack overflow) | 2,382 | - |

At 1,000 lines the gain is between 9x and 72x. Not every part got faster: XML parsing (about 40 to 50 ms for 1,000 lines) and the XML Schema check (10 to 25 ms) were never the bottleneck and are unchanged. The 100-line values include the cost of the first calls (JIT), so their ratio is smaller than it would be for a long-running process.

Before this change, the EN 16931 rules took 4.5 to 30 seconds at 1,000 lines because many rules start with `//cac:InvoiceLine` or `//ram:IncludedSupplyChainTradeLineItem` and then look at the whole document again for every line, which is quadratic. At 5,000 lines the old engine did not finish at all: it ran out of stack space while collecting nodes of the document. That is fixed.

Time still grows faster than the number of lines (UBL XRechnung: 675 ms at 1,000 lines, 4.6 s at 5,000), so very large invoices are not free. Time per line is roughly 0.5 to 1 ms for UBL and 0.4 to 0.5 ms for CII in this measurement.

Verdicts and messages did not change. All 1,142 CEN unit tests, the KoSIT test suite and the XML Schema verdict tests pass unchanged.

## What changed

- The XPath engine indexes a document once by element and attribute name, so `//name` is a lookup in document order instead of a walk through every node.
- Absolute paths that depend only on the document (`/a/b/c/@x`, no variables) are evaluated once per validation run and reused by every rule that repeats them.
- Collecting and sorting nodes no longer copies arrays more often than needed, and steps without predicates do not build an evaluation context.

## Measuring it yourself

The benchmark builds invoices of any size from the sample invoices of the XRechnung test suite and times each phase. It is not part of the CI run.

```bash
cd packages/core
pnpm bench                                  # 100, 1,000 and 5,000 lines, 7 runs each
pnpm bench --runs 11 --sizes 100,1000
pnpm bench --json                           # machine-readable
```

A test (`test/performance.test.ts`) validates 1,000 lines in UBL and CII with a limit of 10 seconds. That is about 10 to 25 times the normal time on the machine above, so it passes on slow CI runners but fails if the quadratic behaviour comes back.

## Validating many files

For batches there is `validateMany` (`@sweberdev/summand/batch`), see [Validating many invoices](batch.md). It runs the same validation in a pool of worker threads. The numbers below show what that buys and what it does not.

Whole batch, in milliseconds, median of 7 runs after one warm-up run. Every run reads the files from disk and validates each with all phases on (XML Schema, EN 16931 rules, XRechnung rules); the pool, including starting its worker threads, is created anew in every run. "Loop" is a plain `for` loop with `validateInvoice` on the calling thread, which is already warm from the warm-up run; `validateMany(n)` is `concurrency: n`, where 1 means the calling thread without workers. Node 22.22.0 on an Intel Xeon @ 2.10 GHz with 4 available cores (a cloud container), Linux 6.18.

| Batch | Loop | validateMany(1) | validateMany(2) | validateMany(3) | validateMany(4) |
|---|---|---|---|---|---|
| 200 small invoices (5 to 25 KB) | 1,127 | 1,187 | 1,466 | 1,592 | 1,693 |
| 40 invoices with 100 lines (110 to 195 KB) | 2,589 | 2,467 | 2,049 | 2,281 | 2,793 |
| 8 invoices with 1,000 lines (1.1 to 1.9 MB) | 5,052 | 5,020 | 3,410 | 3,393 | 3,577 |

Speed-up against the loop (above 1 is faster):

| Batch | (1) | (2) | (3) | (4) |
|---|---|---|---|---|
| 200 small invoices | 0.95x | 0.77x | 0.71x | 0.67x |
| 40 invoices with 100 lines | 1.05x | 1.26x | 1.14x | 0.93x |
| 8 invoices with 1,000 lines | 1.01x | 1.48x | 1.49x | 1.41x |

**What this says, honestly:**

- On this machine the pool helps only for large invoices, by about 1.5x with 2 to 4 workers, and not by 4x on 4 cores. For 100-line invoices the gain is at most 1.26x, and for small invoices the pool is **slower** than the loop. A worker has to start, load the rule sets and run its first invoices unoptimised, which costs a few hundred milliseconds per batch; results also have to be copied back to the calling thread. If the whole batch takes about a second sequentially, use `concurrency: 1` or the plain loop.
- The limit is not the pool alone. As a control we validated the same eight 1,000-line files in plain Node processes without any pool: 8 files in one process took 5.8 to 6.9 s; the same files split over 4 separate processes (2 files each) took between 3.0 and 6.4 s per process in four attempts, so 4 processes gave between about 1x and about 2x. On this container validation is limited by memory bandwidth and shared resources, and the timings vary from run to run. A CPU-only loop scales perfectly on the same container (4 processes took as long as 1), so the cores are real; the workload is memory-hungry (it builds a tree of the whole XML document and a node index). Expect better scaling on a machine with more memory bandwidth per core, and measure on yours.
- An earlier run of the same benchmark (5 runs, concurrency 1, 2 and 4) gave the same picture: 1.0x to 1.5x for 1,000-line invoices, 1.0x to 1.2x for 100 lines, 0.74x to 1.2x for small invoices.
- Memory per worker is that of one validation, so a large `concurrency` multiplies the peak memory of big invoices; this is the second reason the default is capped at `min(4, cores)`.

The benefit that does not depend on the machine is that the calling thread stays free (your server or UI keeps responding during a long batch) and that results can be streamed in order while the batch is still running.

### Measuring it yourself

```bash
cd packages/core
pnpm build                                 # the workers load dist/batch-worker.js
pnpm bench:batch                           # three batches, concurrency 1, 2 and 4, 5 runs each
pnpm bench:batch --runs 7 --concurrency 1,2,3,4
pnpm bench:batch --json                    # machine-readable, with the machine description
```

The batches are built from the sample invoices of the XRechnung test suite (small), and from generated invoices with 100 and 1,000 lines (the same generator as `pnpm bench`). Compare the ratios and run it on the hardware you will deploy on.
