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
