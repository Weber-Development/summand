---
title: CLI
description: Validate invoices from the command line or in CI, extract XML from PDFs and check Leitweg-IDs.
---

```bash
npx @sweberdev/summand validate invoices/*.xml invoices/*.pdf
```

```
valid   invoices/RE-1001.xml  XRechnung 3.0  0 error(s), 0 warning(s)
INVALID invoices/RE-1002.pdf  EN 16931 (PDF)  1 error(s), 2 warning(s)
  error   BR-CO-15 (line 214): Invoice total amount with VAT (BT-112) = Invoice total amount without VAT (BT-109) + Invoice total VAT amount (BT-110).
```

The exit code is 1 when at least one invoice is invalid, so it can guard a CI step or a script.

## Commands

| Command | Does |
|---|---|
| `summand validate <files...>` | Validate XML and PDF files |
| `summand extract <file.pdf> [--out file.xml]` | Write the embedded XML of a ZUGFeRD / Factur-X PDF |
| `summand leitweg <id>` | Check a Leitweg-ID and print the correct check digits |

## validate options

| Option | Effect |
|---|---|
| `--json` | One JSON result per line (JSON Lines) |
| `--xrechnung` | Apply XRechnung rules to every invoice |
| `--strict-extended` | EXTENDED: EN 16931 violations are errors |
| `--warnings-as-errors` | Exit 1 on warnings too |
| `--quiet` | Only the summary line per file |

## In code

```ts
import { runCli } from "@sweberdev/summand/cli";
const code = await runCli(["validate", "invoice.xml"]);
```
