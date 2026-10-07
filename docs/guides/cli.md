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

The exit code is 1 when at least one invoice is invalid, so it can guard a CI step or a script. All exit codes are listed [below](#exit-codes).

## Commands

| Command | Does |
|---|---|
| `summand validate <files...>` | Validate XML and PDF files |
| `summand extract <file.pdf> [--out file.xml]` | Write the embedded XML of a ZUGFeRD / Factur-X PDF |
| `summand leitweg <id>` | Check a Leitweg-ID and print the correct check digits |
| `summand --version` | Print the version |
| `summand rules [--json] [--check [--fail-on-outdated]]` | List the bundled rule sets with version, source, licence and rule count; `--check` asks whether newer releases exist (exit code 3 with `--fail-on-outdated`). See [Rule sets and updates](rule-sets.md). |

## validate options

| Option | Effect |
|---|---|
| `--json` | One JSON result per line (JSON Lines) |
| `--xrechnung` | Apply XRechnung rules to every invoice |
| `--strict-extended` | EXTENDED: EN 16931 violations are errors |
| `--no-schema` | Skip the XML Schema (XSD) check |
| `--no-leitweg` | Do not check the Leitweg-ID in the buyer reference |
| `--lang de` | Messages and output in German (default `en`) |
| `--warnings-as-errors` | Exit 1 on warnings too |
| `--quiet` | Only the summary line per file |

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success: every invoice is valid |
| 1 | An invoice is invalid (or has warnings with `--warnings-as-errors`), or the command failed: unknown command or option, missing arguments, unreadable file |
| 3 | `rules --check --fail-on-outdated`: a newer release of a bundled rule set exists |

Code 2 is reserved. To tell an invalid invoice from a failed run, use `--json` and read `valid`. Details: [Error codes](../reference/error-codes.md#exit-codes-of-the-summand-command).

## JSON output

`--json` prints one line per file: `{ "file": "invoice.xml", ...result }`, where `result` is the [`ValidationResult`](validate.md#the-result). The field names are stable.

## In code

```ts
import { runCli } from "@sweberdev/summand/cli";
const code = await runCli(["validate", "invoice.xml"]);
```
